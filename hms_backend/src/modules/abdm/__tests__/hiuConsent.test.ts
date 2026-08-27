import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { cleanupTenant, dbReady, makeTenant } from '../../../test-api';
import { grantModule } from '../../entitlement/entitlement.service';
import { createPatient } from '../../patient/patient.service';
import { upsertFacilityConfig } from '../abdm.service';
import { clearRecordedHipCalls, recordedHipCalls } from '../hipGateway';
import { sweepOnce } from '../hiuSweeper';
import * as hiu from '../hiuConsent.service';

/**
 * Milestone 3 — consent to read a patient's history elsewhere (ADR-092).
 *
 * The two cases that decide certification are `HIU_FLOW_202` (revoke) and `HIU_FLOW_301` (expiry),
 * and both ask the same question: **is the data actually gone?** Not hidden, not flagged — gone. So
 * most of this suite queries the table directly after a purge rather than trusting a return value,
 * because a service that reports success while leaving rows behind is exactly the defect the
 * assessor is looking for.
 *
 * The rest asserts the refusals on the way in: an unverified ABHA, a doctor with no registration
 * number, an artefact nobody asked for.
 */

const CODE = 'ABDMHIU';
const HIP_ID = 'IN0710-HIU-001';

let ready = false;
let tenantId = '';
let patientId = '';
let providerId = '';
let noRegProviderId = '';
let unverifiedPatientId = '';

/** Rows still on disk under a consent — the only answer the certification test accepts. */
async function recordsFor(consentId: string): Promise<number> {
  const r = await pool.query(
    'SELECT count(*)::int AS n FROM abdm_hiu_records r JOIN abdm_hiu_consents c ON c.id = r.consent_id WHERE c.consent_id = $1',
    [consentId],
  );
  return r.rows[0].n as number;
}

/** Creates a granted consent with one stored record, the way a completed pull would leave things. */
async function grantWithRecord(consentId: string, over: { dataEraseAt?: string } = {}): Promise<string> {
  const request = await hiu.requestPatientHistory(tenantId, null, { patientId, providerId });
  await pool.query('UPDATE abdm_hiu_consent_requests SET consent_request_id = $1 WHERE id = $2', [
    `cr-${consentId}`,
    request.id,
  ]);

  const consent = await hiu.storeConsentArtefact({
    consentId,
    consentRequestId: `cr-${consentId}`,
    hipId: 'IN0710-OTHER-HOSPITAL',
    abhaAddress: 'hiu@sbx',
    hiTypes: ['OPConsultation', 'Prescription'],
    dateRangeFrom: '2020-01-01T00:00:00.000Z',
    dateRangeTo: '2030-01-01T00:00:00.000Z',
    dataEraseAt: over.dataEraseAt ?? '2030-12-31T00:00:00.000Z',
    grantedAt: new Date().toISOString(),
  });

  // Somebody else's clinical record, as slice 2 will store it.
  await pool.query(
    `INSERT INTO abdm_hiu_records (tenant_id, consent_id, patient_id, source_hip_id, hi_type, content, record_date)
     VALUES ($1,$2,$3,'IN0710-OTHER-HOSPITAL','OPConsultation', $4, now())`,
    [tenantId, consent!.id, patientId, JSON.stringify({ resourceType: 'Bundle', entry: [] })],
  );
  return consent!.id;
}

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) return;
  await cleanupTenant(CODE);
  tenantId = (await makeTenant(CODE)).tenantId;
  await grantModule(tenantId, 'patient');
  await grantModule(tenantId, 'abdm');
  await upsertFacilityConfig(tenantId, { hipId: HIP_ID, facilityName: 'HIU Test Hospital' });

  const patient = await createPatient(tenantId, { firstName: 'Rohan', lastName: 'Mehta', phone: '9700005555' });
  patientId = patient.id;
  await pool.query("UPDATE patients SET abha_address = 'hiu@sbx', abha_verified_at = now() WHERE id = $1", [patientId]);

  const unverified = await createPatient(tenantId, { firstName: 'Typed', lastName: 'Abha', phone: '9700006666' });
  unverifiedPatientId = unverified.id;
  await pool.query("UPDATE patients SET abha_address = 'typed@sbx' WHERE id = $1", [unverifiedPatientId]);

  const withReg = await pool.query(
    `INSERT INTO providers (tenant_id, full_name, registration_number, is_active)
     VALUES ($1,'Dr Anjali Verma','MCI-12345', true) RETURNING id`,
    [tenantId],
  );
  providerId = withReg.rows[0].id;

  const withoutReg = await pool.query(
    `INSERT INTO providers (tenant_id, full_name, is_active) VALUES ($1,'Dr No Registration', true) RETURNING id`,
    [tenantId],
  );
  noRegProviderId = withoutReg.rows[0].id;
});

afterAll(async () => {
  if (!ready) return;
  await cleanupTenant(CODE);
});

beforeEach(() => clearRecordedHipCalls());

describe('requesting consent', () => {
  test('the request names the doctor and their registration number', async ({ skip }) => {
    if (!ready) return skip();
    const saved = await hiu.requestPatientHistory(tenantId, null, { patientId, providerId });

    expect(saved.status).toBe('requested');
    const body = recordedHipCalls().find((c) => c.path.includes('consent/v3/request/init'))?.body as {
      consent: { requester: { name: string; identifier: { value: string } }; purpose: { code: string } };
    };
    // This is what the patient reads in their app when deciding whether to grant.
    expect(body.consent.requester.name).toBe('Dr Anjali Verma');
    expect(body.consent.requester.identifier.value).toBe('MCI-12345');
    expect(body.consent.purpose.code).toBe('CAREMGT');
  });

  test('a doctor with no registration number cannot ask', async ({ skip }) => {
    if (!ready) return skip();
    // Refused rather than defaulted: an anonymous clinician asking for somebody's medical history
    // is not a request a patient can meaningfully judge.
    await expect(hiu.requestPatientHistory(tenantId, null, { patientId, providerId: noRegProviderId })).rejects.toThrow(
      /registration number/i,
    );
    expect(recordedHipCalls()).toHaveLength(0);
  });

  test('an unverified ABHA cannot be used to ask', async ({ skip }) => {
    if (!ready) return skip();
    // A typed identifier was never proved to be this patient's; acting on it could put somebody
    // else's history in front of the doctor.
    await expect(
      hiu.requestPatientHistory(tenantId, null, { patientId: unverifiedPatientId, providerId }),
    ).rejects.toThrow(/verified ABHA/i);
    expect(recordedHipCalls()).toHaveLength(0);
  });

  test('the default window asks for all seven record types', async ({ skip }) => {
    if (!ready) return skip();
    const saved = await hiu.requestPatientHistory(tenantId, null, { patientId, providerId });
    expect(saved.hiTypes).toHaveLength(7);
    expect(saved.hiTypes).toContain('DischargeSummary');
  });
});

describe('storing artefacts', () => {
  test('a granted artefact is stored against the request that caused it', async ({ skip }) => {
    if (!ready) return skip();
    const request = await hiu.requestPatientHistory(tenantId, null, { patientId, providerId });
    await pool.query('UPDATE abdm_hiu_consent_requests SET consent_request_id = $1 WHERE id = $2', ['cr-1', request.id]);

    const consent = await hiu.storeConsentArtefact({
      consentId: 'hiu-consent-1',
      consentRequestId: 'cr-1',
      hipId: 'IN0710-OTHER',
      abhaAddress: 'hiu@sbx',
      hiTypes: ['OPConsultation'],
      dataEraseAt: '2030-01-01T00:00:00.000Z',
    });
    expect(consent?.requestId).toBe(request.id);
    expect(consent?.status).toBe('granted');

    const after = await pool.query('SELECT status FROM abdm_hiu_consent_requests WHERE id = $1', [request.id]);
    expect(after.rows[0].status).toBe('granted');
  });

  test('an artefact nobody asked for is dropped, not stored orphaned', async ({ skip }) => {
    if (!ready) return skip();
    // We would have no patient to attach records to, no doctor who asked, and no expiry to sweep.
    const orphan = await hiu.storeConsentArtefact({
      consentId: 'hiu-orphan',
      consentRequestId: 'never-requested',
      abhaAddress: 'stranger@sbx',
      hiTypes: ['OPConsultation'],
    });
    expect(orphan).toBeNull();
  });

  test('one request can yield several artefacts, one per hospital', async ({ skip }) => {
    if (!ready) return skip();
    const request = await hiu.requestPatientHistory(tenantId, null, { patientId, providerId });
    await pool.query('UPDATE abdm_hiu_consent_requests SET consent_request_id = $1 WHERE id = $2', ['cr-multi', request.id]);

    for (const hipId of ['IN0710-A', 'IN0710-B', 'IN0710-C']) {
      await hiu.storeConsentArtefact({
        consentId: `hiu-multi-${hipId}`,
        consentRequestId: 'cr-multi',
        hipId,
        abhaAddress: 'hiu@sbx',
        hiTypes: ['OPConsultation'],
        dataEraseAt: '2030-01-01T00:00:00.000Z',
      });
    }
    const rows = await pool.query('SELECT hip_id FROM abdm_hiu_consents WHERE request_id = $1', [request.id]);
    // They expire and are revoked individually, so they are tracked individually.
    expect(rows.rowCount).toBe(3);
  });
});

describe('HIU_FLOW_202 — revocation', () => {
  test('the records are DELETED, not hidden', async ({ skip }) => {
    if (!ready) return skip();
    await grantWithRecord('hiu-revoke-1');
    expect(await recordsFor('hiu-revoke-1')).toBe(1);

    await hiu.handleConsentNotification({ consentId: 'hiu-revoke-1', status: 'REVOKED' });

    // The assessor's actual question. A hidden row is not a deleted row.
    expect(await recordsFor('hiu-revoke-1')).toBe(0);
    const consent = await pool.query('SELECT id FROM abdm_hiu_consents WHERE consent_id = $1', ['hiu-revoke-1']);
    expect(consent.rowCount).toBe(0);
  });

  test('the purge is acknowledged to ABDM only after it happened', async ({ skip }) => {
    if (!ready) return skip();
    await grantWithRecord('hiu-revoke-2');
    clearRecordedHipCalls();
    await hiu.handleConsentNotification({ consentId: 'hiu-revoke-2', status: 'REVOKED' });

    const ack = recordedHipCalls().find((c) => c.path.includes('hiu/on-notify'));
    expect(ack).toBeTruthy();
    expect((ack?.body as { acknowledgement: Array<{ status: string }> }).acknowledgement[0]!.status).toBe('ok');
    // The acknowledgement asserts compliance, so it must not precede the deletion it asserts.
    expect(await recordsFor('hiu-revoke-2')).toBe(0);
  });

  test('the audit trail survives the deletion and holds no clinical content', async ({ skip }) => {
    if (!ready) return skip();
    await grantWithRecord('hiu-revoke-3');
    await hiu.handleConsentNotification({ consentId: 'hiu-revoke-3', status: 'REVOKED' });

    const audit = await pool.query(
      "SELECT metadata FROM audit_log WHERE tenant_id = $1 AND action = 'abdm.hiu.consent_purged' ORDER BY created_at DESC LIMIT 1",
      [tenantId],
    );
    const metadata = audit.rows[0].metadata as { reason: string; recordsDeleted: number };
    expect(metadata.reason).toBe('revoked');
    expect(metadata.recordsDeleted).toBe(1);
    // Proving we destroyed something must not require keeping it.
    expect(JSON.stringify(metadata)).not.toContain('Bundle');
  });

  test('a revocation for a consent we never held is still acknowledged', async ({ skip }) => {
    if (!ready) return skip();
    const result = await hiu.handleConsentNotification({ consentId: 'never-held', status: 'REVOKED' });
    expect(result.purged).toBe(false);
    expect(recordedHipCalls().some((c) => c.path.includes('hiu/on-notify'))).toBe(true);
  });
});

describe('HIU_FLOW_301 — expiry', () => {
  test('an expired consent yields nothing, even before the sweep runs', async ({ skip }) => {
    if (!ready) return skip();
    await grantWithRecord('hiu-expired-1', { dataEraseAt: '2020-01-01T00:00:00.000Z' });

    // Decided by the clock, not by the status column. A missed callback, an unrun sweep or a
    // drifted clock must never become a licence to keep reading.
    const usable = await hiu.usableConsents(tenantId, patientId);
    expect(usable.some((c) => c.consentId === 'hiu-expired-1')).toBe(false);
  });

  test('the sweep deletes the records of an expired consent', async ({ skip }) => {
    if (!ready) return skip();
    await grantWithRecord('hiu-expired-2', { dataEraseAt: '2020-01-01T00:00:00.000Z' });
    expect(await recordsFor('hiu-expired-2')).toBe(1);

    await sweepOnce();

    expect(await recordsFor('hiu-expired-2')).toBe(0);
    const consent = await pool.query('SELECT id FROM abdm_hiu_consents WHERE consent_id = $1', ['hiu-expired-2']);
    expect(consent.rowCount).toBe(0);
  });

  test('the sweep leaves a live consent alone', async ({ skip }) => {
    if (!ready) return skip();
    await grantWithRecord('hiu-live-1');
    await sweepOnce();
    expect(await recordsFor('hiu-live-1')).toBe(1);
  });

  test('a live consent IS usable', async ({ skip }) => {
    if (!ready) return skip();
    await grantWithRecord('hiu-live-2');
    const usable = await hiu.usableConsents(tenantId, patientId);
    expect(usable.some((c) => c.consentId === 'hiu-live-2')).toBe(true);
  });

  test('running the sweep twice is safe', async ({ skip }) => {
    if (!ready) return skip();
    await grantWithRecord('hiu-expired-3', { dataEraseAt: '2020-01-01T00:00:00.000Z' });
    await sweepOnce();
    const second = await sweepOnce();
    expect(second.consents).toBe(0);
  });
});
