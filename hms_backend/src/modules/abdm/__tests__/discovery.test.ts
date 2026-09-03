import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { cleanupTenant, dbReady, makeTenant } from '../../../test-api';
import { grantModule } from '../../entitlement/entitlement.service';
import { createPatient } from '../../patient/patient.service';
import { upsertFacilityConfig } from '../abdm.service';
import { labelForVisit, recordCareContext } from '../careContext.service';
import { discoverPatient } from '../discovery.service';
import { clearRecordedHipCalls, recordedHipCalls } from '../hipGateway';
import { confirmUserLink, initUserLink, respondToDiscovery } from '../userLinking.service';

/**
 * Discovery and user-initiated linking (ADR-090).
 *
 * The matcher is where the danger in M2 lives: answer "who is this?" too loosely and one patient is
 * handed another's records. Most of this suite is deliberately about the cases where the right
 * answer is **nobody**.
 */

const CODE = 'ABDMDISC';
const HIP_ID = 'IN0710-DISC-001';

let ready = false;
let tenantId = '';
let meeraId = '';
let twinId = '';

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) return;
  await cleanupTenant(CODE);
  tenantId = (await makeTenant(CODE)).tenantId;
  await grantModule(tenantId, 'patient');
  await grantModule(tenantId, 'abdm');
  await upsertFacilityConfig(tenantId, { hipId: HIP_ID, facilityName: 'Discovery Test Hospital' });

  const meera = await createPatient(tenantId, {
    firstName: 'Meera',
    lastName: 'Iyer',
    gender: 'female',
    dateOfBirth: '1988-06-14',
    phone: '9876500100',
  });
  meeraId = meera.id;
  await pool.query(
    "UPDATE patients SET abha_address = 'meera.iyer@sbx', abha_verified_at = now() WHERE id = $1",
    [meeraId],
  );

  await recordCareContext({
    tenantId,
    patientId: meeraId,
    referenceNumber: 'visit-disc-1',
    displayLabel: labelForVisit('2026-10-03'),
    hiType: 'OPConsultation',
  });
  await recordCareContext({
    tenantId,
    patientId: meeraId,
    referenceNumber: 'visit-disc-2',
    displayLabel: labelForVisit('2026-11-11'),
    hiType: 'Prescription',
  });

  // A twin: same name, same year of birth, same household mobile. Real, and the case that must
  // never resolve to a guess.
  // `allowDuplicate` because our own duplicate guard (ADR-066) correctly objects to a same
  // name + same phone registration — which is what a front desk overrides after checking, and
  // exactly the situation that makes the discovery matcher's ambiguity rule necessary.
  const twin = await createPatient(tenantId, {
    firstName: 'Meera',
    lastName: 'Iyer',
    gender: 'female',
    dateOfBirth: '1988-11-02',
    phone: '9876500100',
    allowDuplicate: true,
  });
  twinId = twin.id;
  await pool.query("UPDATE patients SET date_of_birth = '1988-02-02' WHERE id = $1", [twinId]);
});

afterAll(async () => {
  if (!ready) return;
  await pool.query('DELETE FROM abdm_link_requests WHERE tenant_id = $1', [tenantId]);
  await cleanupTenant(CODE);
});

beforeEach(() => clearRecordedHipCalls());

describe('matching a patient', () => {
  test('a verified ABHA address is conclusive on its own', async ({ skip }) => {
    if (!ready) return skip();
    const result = await discoverPatient(tenantId, { abhaAddress: 'meera.iyer@sbx' });
    expect(result.patient?.id).toBe(meeraId);
    expect(result.matchedBy).toEqual(['HEALTH_ID']);
    expect(result.careContexts).toHaveLength(2);
  });

  test('demographics need mobile AND name AND year of birth together', async ({ skip }) => {
    if (!ready) return skip();
    const full = await discoverPatient(tenantId, {
      mobile: '9876500100',
      name: 'Meera Iyer',
      gender: 'F',
      yearOfBirth: 1988,
    });
    // Two charts share all three — a household mobile makes that ordinary.
    expect(full.patient).toBeUndefined();
    expect(full.reason).toContain('More than one chart');
  });

  test('a mobile number alone matches nobody', async ({ skip }) => {
    if (!ready) return skip();
    // One identifier is a coincidence, not an identification.
    const result = await discoverPatient(tenantId, { mobile: '9876500100' });
    expect(result.patient).toBeUndefined();
    expect(result.matchedBy).toEqual([]);
  });

  test('a self-declared hospital number alone matches nobody', async ({ skip }) => {
    if (!ready) return skip();
    // It is unverified: guessable, mistypeable, and readable off someone else's card. Treating it
    // as proof would make our own UHID sequence an attack surface.
    const patient = await pool.query('SELECT uhid FROM patients WHERE id = $1', [meeraId]);
    const result = await discoverPatient(tenantId, { medicalRecordNumber: patient.rows[0].uhid });
    expect(result.patient).toBeUndefined();
  });

  test('but it CAN choose between demographic candidates', async ({ skip }) => {
    if (!ready) return skip();
    // The weaker-signal role ABDM describes: it breaks a tie the patient has already narrowed.
    const uhid = (await pool.query('SELECT uhid FROM patients WHERE id = $1', [meeraId])).rows[0]
      .uhid;
    const result = await discoverPatient(tenantId, {
      mobile: '9876500100',
      name: 'Meera Iyer',
      yearOfBirth: 1988,
      medicalRecordNumber: uhid,
    });
    expect(result.patient?.id).toBe(meeraId);
    expect(result.matchedBy).toContain('MR');
  });

  test('a contradicting gender prevents a match', async ({ skip }) => {
    if (!ready) return skip();
    const result = await discoverPatient(tenantId, {
      mobile: '9876500100',
      name: 'Meera Iyer',
      gender: 'M',
      yearOfBirth: 1988,
    });
    expect(result.patient).toBeUndefined();
  });

  test('an unknown person matches nobody', async ({ skip }) => {
    if (!ready) return skip();
    const result = await discoverPatient(tenantId, {
      abhaAddress: 'nobody@sbx',
      mobile: '9000000000',
      name: 'Nobody Here',
      yearOfBirth: 1970,
    });
    expect(result.patient).toBeUndefined();
    expect(result.reason).toContain('No chart matches');
  });
});

describe('answering the gateway', () => {
  test('a match returns care contexts with no clinical information', async ({ skip }) => {
    if (!ready) return skip();
    await respondToDiscovery({
      hipId: HIP_ID,
      transactionId: 'txn-1',
      requestId: 'req-1',
      request: { abhaAddress: 'meera.iyer@sbx' },
    });

    const call = recordedHipCalls().at(-1)!;
    expect(call.path).toBe('/api/hiecm/user-initiated-linking/v3/patient/care-context/on-discover');
    const body = call.body as {
      matchedBy: string[];
      patient: Array<{ careContexts: Array<{ display: string }> }>;
    };
    expect(body.matchedBy).toEqual(['HEALTH_ID']);
    expect(body.patient[0]!.careContexts).toHaveLength(2);
    // Labels are dates and settings; nothing else may reach the consent manager.
    for (const context of body.patient[0]!.careContexts) {
      expect(context.display).toMatch(/^OPD records from \d{2}\/\d{2}\/\d{4}$/);
    }
  });

  test('no match still answers, with an empty patient list', async ({ skip }) => {
    if (!ready) return skip();
    // Silence would leave the patient's app waiting; an empty answer tells them we hold nothing.
    await respondToDiscovery({
      hipId: HIP_ID,
      request: { abhaAddress: 'nobody@sbx' },
      transactionId: 'txn-2',
    });
    const body = recordedHipCalls().at(-1)!.body as { patient: unknown[]; matchedBy: string[] };
    expect(body.patient).toEqual([]);
    expect(body.matchedBy).toEqual([]);
  });

  test('an unknown facility is answered by silence, not an error', async ({ skip }) => {
    if (!ready) return skip();
    const result = await respondToDiscovery({
      hipId: 'NOT-A-FACILITY',
      request: { abhaAddress: 'meera.iyer@sbx' },
    });
    expect(result.matched).toBe(false);
    expect(recordedHipCalls()).toHaveLength(0);
  });
});

describe('the patient linking what they found', () => {
  test('only contexts that actually belong to them can be linked', async ({ skip }) => {
    if (!ready) return skip();
    const uhid = (await pool.query('SELECT uhid FROM patients WHERE id = $1', [meeraId])).rows[0]
      .uhid;
    // A reference the caller invented, or somebody else's — refused, because these arrive from
    // outside and a caller naming any reference could otherwise take another patient's records.
    const result = await initUserLink({
      hipId: HIP_ID,
      transactionId: 'txn-3',
      patientReference: uhid,
      careContextRefs: ['visit-belonging-to-nobody'],
    });
    expect(result).toEqual({ refused: 'None of those care contexts belong to this patient' });
  });

  test('init sends an OTP and tells ABDM one is coming', async ({ skip }) => {
    if (!ready) return skip();
    const uhid = (await pool.query('SELECT uhid FROM patients WHERE id = $1', [meeraId])).rows[0]
      .uhid;
    const result = await initUserLink({
      hipId: HIP_ID,
      transactionId: 'txn-4',
      requestId: 'req-4',
      patientReference: uhid,
      careContextRefs: ['visit-disc-1', 'visit-belonging-to-nobody'],
    });
    expect('referenceNumber' in result).toBe(true);

    const call = recordedHipCalls().at(-1)!;
    expect(call.path).toBe('/api/hiecm/user-initiated-linking/v3/link/care-context/on-init');
    const body = call.body as {
      link: { meta: { communicationMedium: string }; referenceNumber: string };
    };
    expect(body.link.meta.communicationMedium).toBe('MOBILE');

    // The code is hashed at rest and never returned — the request row proves the first half.
    const row = await pool.query(
      'SELECT code_hash, care_context_refs FROM abdm_link_requests WHERE reference_number = $1',
      [body.link.referenceNumber],
    );
    expect(row.rows[0].code_hash).toHaveLength(64);
    // Only the context they actually own survived the intersection.
    expect(row.rows[0].care_context_refs).toEqual(['visit-disc-1']);
  });

  test('a wrong code links nothing, and still answers', async ({ skip }) => {
    if (!ready) return skip();
    const uhid = (await pool.query('SELECT uhid FROM patients WHERE id = $1', [meeraId])).rows[0]
      .uhid;
    const init = (await initUserLink({
      hipId: HIP_ID,
      transactionId: 'txn-5',
      patientReference: uhid,
      careContextRefs: ['visit-disc-1'],
    })) as { referenceNumber: string };

    clearRecordedHipCalls();
    const result = await confirmUserLink({
      hipId: HIP_ID,
      referenceNumber: init.referenceNumber,
      token: '000000',
    });
    expect(result.linked).toBe(0);
    // Answered anyway — a hanging app is worse than a clear refusal.
    const call = recordedHipCalls().at(-1)!;
    expect(call.path).toBe('/api/hiecm/user-initiated-linking/v3/link/care-context/on-confirm');
    expect((call.body as { patient: unknown[] }).patient).toEqual([]);
  });

  test('the right code links exactly what was chosen', async ({ skip }) => {
    if (!ready) return skip();
    const uhid = (await pool.query('SELECT uhid FROM patients WHERE id = $1', [meeraId])).rows[0]
      .uhid;
    const init = (await initUserLink({
      hipId: HIP_ID,
      transactionId: 'txn-6',
      patientReference: uhid,
      careContextRefs: ['visit-disc-2'],
    })) as { referenceNumber: string };

    // The code is never returned to any caller, so a test has to read the hash and reverse a
    // six-digit space — which is exactly the property being asserted.
    const hash = (
      await pool.query('SELECT code_hash FROM abdm_link_requests WHERE reference_number = $1', [
        init.referenceNumber,
      ])
    ).rows[0].code_hash as string;
    const { createHash } = await import('node:crypto');
    let code = '';
    for (let i = 0; i < 1_000_000; i++) {
      const candidate = String(i).padStart(6, '0');
      if (createHash('sha256').update(candidate).digest('hex') === hash) {
        code = candidate;
        break;
      }
    }
    expect(code).not.toBe('');

    clearRecordedHipCalls();
    const result = await confirmUserLink({
      hipId: HIP_ID,
      referenceNumber: init.referenceNumber,
      token: code,
    });
    expect(result.linked).toBe(1);

    const body = recordedHipCalls().at(-1)!.body as {
      patient: Array<{ careContexts: Array<{ referenceNumber: string }> }>;
    };
    expect(body.patient[0]!.careContexts.map((c) => c.referenceNumber)).toEqual(['visit-disc-2']);

    // Linked through the same path as HIP-initiated linking, so `status` means one thing.
    const context = await pool.query(
      'SELECT status FROM abdm_care_contexts WHERE reference_number = $1',
      ['visit-disc-2'],
    );
    expect(context.rows[0].status).toBe('linked');
  });

  test('an unknown reference number is refused', async ({ skip }) => {
    if (!ready) return skip();
    const result = await confirmUserLink({
      hipId: HIP_ID,
      referenceNumber: 'never-issued',
      token: '123456',
    });
    expect(result.linked).toBe(0);
    expect(result.reason).toContain('Unknown link request');
  });
});
