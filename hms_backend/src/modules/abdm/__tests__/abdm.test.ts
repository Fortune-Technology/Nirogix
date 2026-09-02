import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { cleanupTenant, dbReady, makeTenant } from '../../../test-api';
import { grantModule } from '../../entitlement/entitlement.service';
import { createPatient, getPatient, updatePatient } from '../../patient/patient.service';
import * as abdm from '../abdm.service';
import { AbdmMockProvider } from '../providers/mockProvider';
import { parseAbdmError } from '../providers/gatewayProvider';

/**
 * ABDM Milestone 1, at the service level (ADR-084).
 *
 * These run against the mock provider — which is the point, not a compromise. The ABDM sandbox
 * allows a handful of OTPs per number per day, so a suite that called it would be non-hermetic,
 * would fail differently depending on the time of day, and could not run in CI at all. The mock
 * holds a real RSA keypair, so the encryption path is genuinely exercised.
 *
 * Aadhaar numbers are chosen for the scenario their last digit selects in the mock:
 * `…0` = the Aadhaar already has an ABHA, `…1` = no mobile linked, `…9` = ABDM rejects the OTP.
 */

const CODE = 'ABDMTEST';
const OTHER_CODE = 'ABDMOTHER';
const OTP = '123456';

/** A clean 12-digit Aadhaar that selects the mock's "creates a new ABHA" path. */
const AADHAAR_NEW = '111122223333';
const AADHAAR_SECOND = '444455556666';
const AADHAAR_OTP_FAILS = '111122223339';
const AADHAAR_NO_MOBILE = '111122223331';
/**
 * The linking suite needs Aadhaar numbers no earlier test has already planted a chart for: an
 * ABHA may sit on exactly one chart per hospital, so reusing one would collide with the rule
 * under test rather than exercising it.
 */
const AADHAAR_LINK_A = '222233334444';
const AADHAAR_LINK_B = '777788889992';
const AADHAAR_LINK_C = '333344445556';
/** Its own identity, because one ABHA number may now belong to exactly one chart (ADR-100). */
const AADHAAR_ISOLATED = '555566667778';
/** Its own Aadhaar, so the two-step merge test does not collide with a chart another test planted. */
const AADHAAR_MERGE = '666677778882';

let ready = false;
let tenantId = '';
let otherTenantId = '';

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) return;
  await cleanupTenant(CODE);
  await cleanupTenant(OTHER_CODE);
  tenantId = (await makeTenant(CODE)).tenantId;
  otherTenantId = (await makeTenant(OTHER_CODE)).tenantId;
  for (const id of [tenantId, otherTenantId]) {
    await grantModule(id, 'patient');
    await grantModule(id, 'abdm');
  }
});

afterAll(async () => {
  if (!ready) return;
  await cleanupTenant(CODE);
  await cleanupTenant(OTHER_CODE);
});

/** Runs the Aadhaar creation flow end to end and returns the verification result. */
async function runAadhaarFlow(aadhaar: string, mobile?: string) {
  const started = await abdm.startAadhaarEnrolment(tenantId, { aadhaar, consentGiven: true });
  return abdm.verifyAadhaarOtp(tenantId, { transactionId: started.transactionId, otp: OTP, mobile });
}

describe('consent', () => {
  test('an Aadhaar OTP is refused without recorded consent', async ({ skip }) => {
    if (!ready) return skip();
    await expect(abdm.startAadhaarEnrolment(tenantId, { aadhaar: AADHAAR_NEW, consentGiven: false })).rejects.toMatchObject({
      statusCode: 422,
      code: 'ABDM_CONSENT_REQUIRED',
    });
    // Refused before anything was written: no transaction, so no OTP was ever sent.
    const rows = await pool.query('SELECT count(*)::int AS c FROM abdm_transactions WHERE tenant_id = $1', [tenantId]);
    expect(Number(rows.rows[0].c)).toBe(0);
  });

  test('an existing-ABHA verification is refused without consent too', async ({ skip }) => {
    if (!ready) return skip();
    await expect(
      abdm.startVerification(tenantId, { identifierType: 'mobile', identifier: '9876543210', consentGiven: false }),
    ).rejects.toMatchObject({ code: 'ABDM_CONSENT_REQUIRED' });
  });

  test('consent is stamped with its version when the flow starts', async ({ skip }) => {
    if (!ready) return skip();
    const started = await abdm.startAadhaarEnrolment(tenantId, { aadhaar: AADHAAR_NEW, consentGiven: true });
    const row = (
      await pool.query('SELECT consent_at, consent_version FROM abdm_transactions WHERE id = $1', [started.transactionId])
    ).rows[0];
    expect(row.consent_at).toBeTruthy();
    expect(row.consent_version).toBe('m1-v1');
  });
});

describe('Aadhaar OTP flow', () => {
  test('creates an ABHA and returns a prefill for the form', async ({ skip }) => {
    if (!ready) return skip();
    const result = await runAadhaarFlow(AADHAAR_NEW);
    expect(result.isNewAbha).toBe(true);
    expect(result.state).toBe('verified');
    expect(result.prefill.abhaNumber).toMatch(/^\d{2}-\d{4}-\d{4}-\d{4}$/);
    expect(result.prefill.firstName).toBeTruthy();
    // ABDM's M/F is translated to the vocabulary the chart stores.
    expect(['male', 'female', 'other']).toContain(result.prefill.gender);
    expect(result.match.outcome).toBe('new');
  });

  test('a rejected OTP fails the transaction rather than half-completing it', async ({ skip }) => {
    if (!ready) return skip();
    const started = await abdm.startAadhaarEnrolment(tenantId, { aadhaar: AADHAAR_OTP_FAILS, consentGiven: true });
    await expect(abdm.verifyAadhaarOtp(tenantId, { transactionId: started.transactionId, otp: OTP })).rejects.toMatchObject({
      code: 'ABDM_INVALID_OTP',
    });
    const row = (await pool.query('SELECT state FROM abdm_transactions WHERE id = $1', [started.transactionId])).rows[0];
    expect(row.state).toBe('failed');
  });

  test("an Aadhaar with no linked mobile surfaces ABDM's own message", async ({ skip }) => {
    if (!ready) return skip();
    // The receptionist needs to know it is the Aadhaar, not the system — generic copy would send
    // them to support instead of to the manual form.
    await expect(abdm.startAadhaarEnrolment(tenantId, { aadhaar: AADHAAR_NO_MOBILE, consentGiven: true })).rejects.toMatchObject(
      { code: 'ABDM_NO_MOBILE_LINKED' },
    );
  });

  test('the secondary mobile check runs when the mobile differs from the Aadhaar-linked one', async ({ skip }) => {
    if (!ready) return skip();
    const result = await runAadhaarFlow(AADHAAR_SECOND, '9000011111');
    expect(result.requiresMobileVerification).toBe(true);

    const otp = await abdm.requestMobileOtp(tenantId, { transactionId: result.transactionId, mobile: '9000011111' });
    const verified = await abdm.verifyMobileOtp(tenantId, { transactionId: otp.transactionId, otp: OTP });
    expect(verified.state).toBe('verified');
    expect(verified.prefill.phone).toBe('9000011111');
  });

  test('the same mobile as the Aadhaar-linked one asks for no second OTP', async ({ skip }) => {
    if (!ready) return skip();
    // The reported case (ADR-131). The number a receptionist types is nearly always the one the
    // first OTP just went to, and the desk was being sent to a second OTP on the same phone —
    // because an ABDM response that omits `mobileMatchesAadhaar` was being read as "does not
    // match". The numbers themselves settle it.
    const linked = `98${AADHAAR_NEW.slice(-8)}`;
    const result = await runAadhaarFlow(AADHAAR_NEW, linked);
    expect(result.requiresMobileVerification).toBeFalsy();
    expect(result.prefill.phone).toBe(linked);
    // And the profile arrives complete on this first step, which is what fills the form.
    expect(result.prefill.firstName).toBeTruthy();
    expect(result.prefill.dateOfBirth).toBeTruthy();
    expect(result.prefill.abhaNumber).toBeTruthy();
  });

  test('ABHA address suggestions can be claimed', async ({ skip }) => {
    if (!ready) return skip();
    const result = await runAadhaarFlow(AADHAAR_NEW);
    const suggestions = await abdm.suggestAbhaAddresses(tenantId, result.transactionId);
    expect(suggestions.length).toBeGreaterThan(0);
    const created = await abdm.createAbhaAddress(tenantId, {
      transactionId: result.transactionId,
      abhaAddress: suggestions[0]!,
    });
    expect(created.abhaAddress).toBe(suggestions[0]);
  });

  test('the ABHA card is streamed, never stored', async ({ skip }) => {
    if (!ready) return skip();
    const result = await runAadhaarFlow(AADHAAR_NEW);
    const card = await abdm.downloadAbhaCard(tenantId, result.transactionId);
    expect(card.data.length).toBeGreaterThan(0);
    expect(card.contentType).toContain('image/');
    // Nothing is written to the file store — the card is a rendering of data we already hold.
    const files = await pool.query('SELECT count(*)::int AS c FROM file_metadata WHERE tenant_id = $1', [tenantId]);
    expect(Number(files.rows[0].c)).toBe(0);
  });
});

describe('a raw Aadhaar number never survives the request', () => {
  test('nothing in the transaction row contains the digits', async ({ skip }) => {
    if (!ready) return skip();
    const started = await abdm.startAadhaarEnrolment(tenantId, { aadhaar: AADHAAR_NEW, consentGiven: true });
    await abdm.verifyAadhaarOtp(tenantId, { transactionId: started.transactionId, otp: OTP });

    const row = (await pool.query('SELECT * FROM abdm_transactions WHERE id = $1', [started.transactionId])).rows[0];
    expect(JSON.stringify(row)).not.toContain(AADHAAR_NEW);
    expect(row.identifier_hint).toBe(`XXXXXXXX${AADHAAR_NEW.slice(-4)}`);

    // And nothing in the audit trail either — that is where a "helpful" metadata field would hide.
    const audit = await pool.query('SELECT metadata FROM audit_log WHERE tenant_id = $1', [tenantId]);
    expect(JSON.stringify(audit.rows)).not.toContain(AADHAAR_NEW);
  });

  test('the database refuses an Aadhaar-shaped hint outright', async ({ skip }) => {
    if (!ready) return skip();
    // Defence in depth: even if the application forgot to mask, the CHECK constraint stops it.
    await expect(
      pool.query(
        `INSERT INTO abdm_transactions (tenant_id, flow, identifier_hint, expires_at)
         VALUES ($1, 'enrol_aadhaar', $2, now() + interval '10 minutes')`,
        [tenantId, AADHAAR_NEW],
      ),
    ).rejects.toThrow();
  });

  test('ABDM tokens are stored encrypted, not in the clear', async ({ skip }) => {
    if (!ready) return skip();
    const result = await runAadhaarFlow(AADHAAR_NEW);
    const row = (
      await pool.query('SELECT linking_token_enc, x_token_enc FROM abdm_transactions WHERE id = $1', [result.transactionId])
    ).rows[0];
    expect(row.linking_token_enc).toMatch(/^v1\./);
    expect(row.linking_token_enc).not.toContain('mock-link-');
    expect(row.x_token_enc).toMatch(/^v1\./);
  });
});

describe('new vs returning patient', () => {
  test('an exact ABHA-number match is a returning patient', async ({ skip }) => {
    if (!ready) return skip();
    // Learn the ABHA the mock issues for this Aadhaar, then plant a chart that already holds it.
    const first = await runAadhaarFlow(AADHAAR_NEW);
    const abhaNumber = first.prefill.abhaNumber!;
    const existing = await createPatient(tenantId, {
      firstName: 'Existing',
      lastName: 'Chart',
      phone: '9111100000',
      abhaNumber,
    });

    const second = await runAadhaarFlow(AADHAAR_NEW);
    expect(second.match.outcome).toBe('returning');
    expect(second.match.candidates).toHaveLength(1);
    expect(second.match.candidates[0]!.id).toBe(existing.id);
    expect(second.match.candidates[0]!.reason).toBe('exact_abha');
  });

  test('an ABHA written with and without separators still matches', async ({ skip }) => {
    if (!ready) return skip();
    const first = await runAadhaarFlow(AADHAAR_SECOND);
    const bare = first.prefill.abhaNumber!.replace(/\D/g, '');
    await createPatient(tenantId, { firstName: 'Bare', lastName: 'Format', phone: '9111100001', abhaNumber: bare });

    const second = await runAadhaarFlow(AADHAAR_SECOND);
    expect(second.match.outcome).toBe('returning');
  });

  test('a demographic look-alike is ambiguous, never merged automatically', async ({ skip }) => {
    if (!ready) return skip();
    const verified = await runAadhaarFlow(AADHAAR_NEW);
    // Same first name, gender and birth year — but no ABHA, and a different person.
    await createPatient(tenantId, {
      firstName: verified.prefill.firstName!,
      lastName: 'Different',
      gender: verified.prefill.gender,
      dateOfBirth: `${verified.prefill.dateOfBirth!.slice(0, 4)}-06-15`,
      phone: '9111100002',
    });

    const again = await abdm.matchPatient(tenantId, {
      firstName: verified.prefill.firstName,
      gender: verified.prefill.gender === 'male' ? 'M' : 'F',
      dateOfBirth: verified.prefill.dateOfBirth,
    });
    expect(again.outcome).toBe('ambiguous');
    expect(again.candidates[0]!.reason).toBe('demographic');
  });

  test('an unknown ABHA is a new patient', async ({ skip }) => {
    if (!ready) return skip();
    const match = await abdm.matchPatient(tenantId, { abhaNumber: '99-9999-9999-9999', firstName: 'Nobody', dateOfBirth: '1990-01-01' });
    expect(match.outcome).toBe('new');
    expect(match.candidates).toHaveLength(0);
  });

  test('a match never reaches across tenants', async ({ skip }) => {
    if (!ready) return skip();
    // A distinct Aadhaar, so this chart gets its own ABHA number: the mock is deterministic, and
    // reusing AADHAAR_NEW would mean two charts in one tenant claiming one national identity —
    // which the uniqueness rule now correctly refuses (ADR-100).
    const verified = await runAadhaarFlow(AADHAAR_ISOLATED);
    await createPatient(tenantId, {
      firstName: 'Isolated',
      phone: '9111100003',
      abhaNumber: verified.prefill.abhaNumber,
    });
    // The other hospital holds no such chart, and RLS is what guarantees it cannot see this one.
    const match = await abdm.matchPatient(otherTenantId, { abhaNumber: verified.prefill.abhaNumber });
    expect(match.outcome).toBe('new');
  });
});

describe('linking a verified ABHA to a chart', () => {
  test('marks the ABHA verified and records how it was obtained', async ({ skip }) => {
    if (!ready) return skip();
    const verified = await runAadhaarFlow(AADHAAR_LINK_A);
    const patient = await createPatient(tenantId, { firstName: 'Link', lastName: 'Target', phone: '9222200000' });

    const linked = await abdm.linkToPatient(tenantId, { transactionId: verified.transactionId, patientId: patient.id });
    expect(linked.abhaNumber).toBe(verified.prefill.abhaNumber);
    expect(linked.abhaVerifiedAt).toBeTruthy();
    expect(linked.abhaSource).toBe('aadhaar_otp');
    expect(linked.abhaConsentAt).toBeTruthy();

    const row = (await pool.query('SELECT state, patient_id FROM abdm_transactions WHERE id = $1', [verified.transactionId])).rows[0];
    expect(row.state).toBe('completed');
    expect(row.patient_id).toBe(patient.id);
  });

  test('the same ABHA cannot be attached to a second chart', async ({ skip }) => {
    if (!ready) return skip();
    const verified = await runAadhaarFlow(AADHAAR_LINK_B);
    const first = await createPatient(tenantId, { firstName: 'First', phone: '9222200001' });
    await abdm.linkToPatient(tenantId, { transactionId: verified.transactionId, patientId: first.id });

    const again = await runAadhaarFlow(AADHAAR_LINK_B);
    const second = await createPatient(tenantId, { firstName: 'Second', phone: '9222200002' });
    await expect(abdm.linkToPatient(tenantId, { transactionId: again.transactionId, patientId: second.id })).rejects.toMatchObject({
      code: 'ABHA_ALREADY_LINKED',
    });
  });

  test('editing the ABHA number by hand drops the verification', async ({ skip }) => {
    if (!ready) return skip();
    const verified = await runAadhaarFlow(AADHAAR_LINK_C);
    const patient = await createPatient(tenantId, { firstName: 'Retyped', phone: '9222200003' });
    await abdm.linkToPatient(tenantId, { transactionId: verified.transactionId, patientId: patient.id });

    await updatePatient(tenantId, patient.id, { abhaNumber: '11-1111-1111-1111' });
    const after = await getPatient(tenantId, patient.id);
    expect(after!.abhaVerifiedAt).toBeNull();
    expect(after!.abhaSource).toBe('manual');
    expect(after!.abhaLinkingTokenEnc).toBeNull();
  });
});

describe('verify an existing ABHA', () => {
  test('by ABHA number', async ({ skip }) => {
    if (!ready) return skip();
    const started = await abdm.startVerification(tenantId, {
      identifierType: 'abha_number',
      identifier: '12-3456-7890-1234',
      consentGiven: true,
    });
    const verified = await abdm.verifyIdentifierOtp(tenantId, { transactionId: started.transactionId, otp: OTP });
    expect(verified.state).toBe('verified');
    expect(verified.prefill.abhaAddress).toContain('@');
  });

  test('by ABHA address', async ({ skip }) => {
    if (!ready) return skip();
    const started = await abdm.startVerification(tenantId, {
      identifierType: 'abha_address',
      identifier: 'ramesh.kumar@sbx',
      consentGiven: true,
    });
    const verified = await abdm.verifyIdentifierOtp(tenantId, { transactionId: started.transactionId, otp: OTP });
    expect(verified.prefill.firstName).toBeTruthy();
  });

  test('by mobile number', async ({ skip }) => {
    if (!ready) return skip();
    const started = await abdm.startVerification(tenantId, {
      identifierType: 'mobile',
      identifier: '9876543210',
      consentGiven: true,
    });
    expect(started.mobileHint).toMatch(/^XXXXXX/);
    const verified = await abdm.verifyIdentifierOtp(tenantId, { transactionId: started.transactionId, otp: OTP });
    expect(verified.prefill.abhaNumber).toBeTruthy();
  });

  test('by Aadhaar number, with the identifier masked in storage', async ({ skip }) => {
    if (!ready) return skip();
    const started = await abdm.startVerification(tenantId, {
      identifierType: 'aadhaar',
      identifier: AADHAAR_NEW,
      consentGiven: true,
    });
    const row = (await pool.query('SELECT identifier_hint FROM abdm_transactions WHERE id = $1', [started.transactionId])).rows[0];
    expect(row.identifier_hint).toBe(`XXXXXXXX${AADHAAR_NEW.slice(-4)}`);
    const verified = await abdm.verifyIdentifierOtp(tenantId, { transactionId: started.transactionId, otp: OTP });
    expect(verified.prefill.abhaNumber).toBeTruthy();
  });

  test('one identifier holding several ABHA accounts asks which one, then loads it', async ({ skip }) => {
    if (!ready) return skip();
    // The mock returns two accounts for an identifier whose digits end in 5 — the shared family
    // mobile case a real desk hits regularly.
    const started = await abdm.startVerification(tenantId, {
      identifierType: 'mobile',
      identifier: '9876543215',
      consentGiven: true,
    });
    const verified = await abdm.verifyIdentifierOtp(tenantId, { transactionId: started.transactionId, otp: OTP });
    expect(verified.accounts?.length).toBe(2);
    expect(verified.prefill.abhaNumber).toBeUndefined();

    const chosen = await abdm.selectAbhaAccount(tenantId, {
      transactionId: started.transactionId,
      abhaNumber: verified.accounts![0]!.abhaNumber,
    });
    expect(chosen.prefill.abhaNumber).toBe(verified.accounts![0]!.abhaNumber);

    // ...and it loads the person, not just their number (ADR-130). The account list is the only
    // place ABDM describes these patients — the call that resolves the chosen one returns a token
    // and little else — so a prefill carrying nothing but the ABHA number left the desk typing a
    // form for a patient ABDM had just named. This assertion is the one that was missing.
    expect(chosen.prefill.abhaAddress).toBe(verified.accounts![0]!.abhaAddress);
    expect(chosen.prefill.gender).toBeTruthy();
    expect(chosen.prefill.dateOfBirth).toBe(verified.accounts![0]!.dateOfBirth);
    expect(chosen.prefill.firstName).toBeTruthy();
  });

  test('a later step never blanks what an earlier one established', async ({ skip }) => {
    if (!ready) return skip();
    // Aadhaar OTP returns the whole demographic record; the mobile OTP that follows it returns a
    // token and the mobile. Taking the newest answer wholesale is what turned a filled card into
    // "Unnamed · Not specified · DOB unknown · no phone" on the final step (ADR-130).
    const started = await abdm.startAadhaarEnrolment(tenantId, {
      aadhaar: AADHAAR_MERGE,
      consentGiven: true,
    });
    const afterAadhaar = await abdm.verifyAadhaarOtp(tenantId, {
      transactionId: started.transactionId,
      otp: OTP,
    });
    expect(afterAadhaar.prefill.firstName).toBeTruthy();
    expect(afterAadhaar.prefill.dateOfBirth).toBeTruthy();

    await abdm.requestMobileOtp(tenantId, { transactionId: started.transactionId, mobile: '9812345678' });
    const afterMobile = await abdm.verifyMobileOtp(tenantId, {
      transactionId: started.transactionId,
      otp: OTP,
    });

    // Everything Aadhaar established survives, and the step that ran adds what it actually knew.
    expect(afterMobile.prefill.firstName).toBe(afterAadhaar.prefill.firstName);
    expect(afterMobile.prefill.lastName).toBe(afterAadhaar.prefill.lastName);
    expect(afterMobile.prefill.gender).toBe(afterAadhaar.prefill.gender);
    expect(afterMobile.prefill.dateOfBirth).toBe(afterAadhaar.prefill.dateOfBirth);
    expect(afterMobile.prefill.abhaNumber).toBe(afterAadhaar.prefill.abhaNumber);
    expect(afterMobile.prefill.addressLine).toBe(afterAadhaar.prefill.addressLine);
    expect(afterMobile.prefill.phone).toBe('9812345678');
  });
});

describe('Scan and Share', () => {
  test('a pushed profile resolves the tenant from the facility id and waits at the desk', async ({ skip }) => {
    if (!ready) return skip();
    await abdm.upsertFacilityConfig(tenantId, {
      hipId: 'HFR-ABDMTEST-001',
      facilityName: 'ABDM Test Hospital',
      qrContent: 'https://facility.example/qr',
      scanShareEnabled: true,
    });

    const accepted = await abdm.handleProfileShare({
      hipId: 'HFR-ABDMTEST-001',
      profile: { abhaNumber: '12-3456-7890-9999', abhaAddress: 'scanned@sbx', firstName: 'Scanned', lastName: 'Patient', gender: 'F', dateOfBirth: '1992-03-04' },
      linkingToken: 'link-token-from-abdm',
      context: '1',
      requestId: 'req-1',
    });
    expect(accepted.accepted).toBe(true);

    const pending = await abdm.listPendingShares(tenantId);
    expect(pending.length).toBeGreaterThan(0);
    expect(pending[0]!.prefill.firstName).toBe('Scanned');
    expect(pending[0]!.abhaAddress).toBe('scanned@sbx');
  });

  test('the pushed linking token is encrypted at rest', async ({ skip }) => {
    if (!ready) return skip();
    const row = (
      await pool.query(
        "SELECT linking_token_enc FROM abdm_transactions WHERE tenant_id = $1 AND flow = 'scan_share' ORDER BY created_at DESC LIMIT 1",
        [tenantId],
      )
    ).rows[0];
    expect(row.linking_token_enc).toMatch(/^v1\./);
    expect(row.linking_token_enc).not.toContain('link-token-from-abdm');
  });

  test('an unknown facility is accepted and dropped, so the endpoint cannot enumerate hospitals', async ({ skip }) => {
    if (!ready) return skip();
    const before = Number((await pool.query('SELECT count(*)::int AS c FROM abdm_transactions')).rows[0].c);
    const result = await abdm.handleProfileShare({ hipId: 'HFR-DOES-NOT-EXIST', profile: { firstName: 'Nobody' } });
    // Identical answer to the accepted case above — that is the whole point.
    expect(result.accepted).toBe(true);
    const after = Number((await pool.query('SELECT count(*)::int AS c FROM abdm_transactions')).rows[0].c);
    expect(after).toBe(before);
  });

  test('a facility with Scan and Share switched off drops the push', async ({ skip }) => {
    if (!ready) return skip();
    await abdm.upsertFacilityConfig(otherTenantId, { hipId: 'HFR-ABDMOTHER-001', scanShareEnabled: false });
    await abdm.handleProfileShare({ hipId: 'HFR-ABDMOTHER-001', profile: { firstName: 'Ignored' } });
    expect(await abdm.listPendingShares(otherTenantId)).toHaveLength(0);
  });

  test('one hospital never sees another hospital"s shared profiles', async ({ skip }) => {
    if (!ready) return skip();
    const mine = await abdm.listPendingShares(tenantId);
    const theirs = await abdm.listPendingShares(otherTenantId);
    expect(mine.length).toBeGreaterThan(0);
    expect(theirs).toHaveLength(0);
  });
});

describe('capabilities and fallback', () => {
  test('capabilities report what this hospital can actually do', async ({ skip }) => {
    if (!ready) return skip();
    const caps = await abdm.getCapabilities(tenantId);
    expect(caps.provider).toBe('mock');
    expect(caps.facilityConfigured).toBe(true);
    expect(caps.scanShareEnabled).toBe(true);
    expect(caps.encryptionConfigured).toBe(true);

    // The other hospital has a facility id but no QR, so Scan and Share is off — and the screen
    // must not offer a control that cannot work.
    const otherCaps = await abdm.getCapabilities(otherTenantId);
    expect(otherCaps.facilityConfigured).toBe(true);
    expect(otherCaps.scanShareEnabled).toBe(false);
    expect(otherCaps.verificationEnabled).toBe(true);
  });

  test('an expired verification cannot be continued', async ({ skip }) => {
    if (!ready) return skip();
    const started = await abdm.startAadhaarEnrolment(tenantId, { aadhaar: AADHAAR_NEW, consentGiven: true });
    await pool.query("UPDATE abdm_transactions SET expires_at = now() - interval '1 minute' WHERE id = $1", [
      started.transactionId,
    ]);
    await expect(abdm.verifyAadhaarOtp(tenantId, { transactionId: started.transactionId, otp: OTP })).rejects.toMatchObject({
      statusCode: 410,
      code: 'ABDM_TXN_EXPIRED',
    });
  });

  test('manual registration is untouched when ABDM is not used at all', async ({ skip }) => {
    if (!ready) return skip();
    const patient = await createPatient(tenantId, {
      firstName: 'Manual',
      lastName: 'Only',
      phone: '9333300000',
      abhaNumber: '55-5555-5555-5555',
    });
    expect(patient.uhid).toMatch(/^UHID-/);
    // A typed ABHA number is stored, and stays unverified for ever — that distinction is the
    // reason `abhaVerifiedAt` exists.
    expect(patient.abhaNumber).toBe('55-5555-5555-5555');
    expect(patient.abhaVerifiedAt).toBeNull();
    expect(patient.abhaSource).toBeNull();
  });

  test('a dismissed verification is closed without touching any chart', async ({ skip }) => {
    if (!ready) return skip();
    const verified = await runAadhaarFlow(AADHAAR_SECOND);
    await abdm.dismissTransaction(tenantId, verified.transactionId);
    const row = (await pool.query('SELECT state, patient_id FROM abdm_transactions WHERE id = $1', [verified.transactionId])).rows[0];
    expect(row.state).toBe('consumed');
    expect(row.patient_id).toBeNull();
  });
});

describe('the mock provider itself', () => {
  test('refuses a malformed Aadhaar before any transaction exists', async ({ skip }) => {
    if (!ready) return skip();
    await expect(abdm.startAadhaarEnrolment(tenantId, { aadhaar: '12345', consentGiven: true })).rejects.toMatchObject({
      code: 'ABDM_INVALID_AADHAAR',
    });
  });

  test('is deterministic — the same Aadhaar always yields the same ABHA', async ({ skip }) => {
    if (!ready) return skip();
    AbdmMockProvider.__reset();
    const a = await runAadhaarFlow(AADHAAR_SECOND);
    const b = await runAadhaarFlow(AADHAAR_SECOND);
    expect(a.prefill.abhaNumber).toBe(b.prefill.abhaNumber);
  });
});

describe('correcting the profile at ABDM', () => {
  test('applies the change and reflects what ABDM now holds', async ({ skip }) => {
    if (!ready) return skip();
    const verified = await runAadhaarFlow(AADHAAR_NEW);
    const updated = await abdm.updateAbhaProfile(tenantId, {
      transactionId: verified.transactionId,
      patch: { lastName: 'Corrected', pincode: '560001' },
    });
    expect(updated.prefill.lastName).toBe('Corrected');
    expect(updated.prefill.pincode).toBe('560001');
    // The ABHA number is not something a correction may change out from under us.
    expect(updated.prefill.abhaNumber).toBe(verified.prefill.abhaNumber);
  });

  test('an empty patch is refused rather than silently accepted', async ({ skip }) => {
    if (!ready) return skip();
    const verified = await runAadhaarFlow(AADHAAR_SECOND);
    await expect(
      abdm.updateAbhaProfile(tenantId, { transactionId: verified.transactionId, patch: {} }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'ABDM_NOTHING_TO_UPDATE' });
  });

  test('the audit records which fields changed, never their values', async ({ skip }) => {
    if (!ready) return skip();
    const verified = await runAadhaarFlow(AADHAAR_LINK_A);
    await abdm.updateAbhaProfile(tenantId, {
      transactionId: verified.transactionId,
      patch: { firstName: 'Renamed' },
    });
    const rows = await pool.query(
      "SELECT metadata FROM audit_log WHERE tenant_id = $1 AND action = 'abdm.profile.updated' ORDER BY created_at DESC LIMIT 1",
      [tenantId],
    );
    expect(rows.rows[0].metadata.fields).toEqual(['firstName']);
    expect(JSON.stringify(rows.rows[0].metadata)).not.toContain('Renamed');
  });
});

describe("reading ABDM's error bodies", () => {
  // Found the hard way against the live sandbox: a 400 was reported as "ABDM request failed (400)"
  // because the reason sat in a `details` ARRAY, which the first parser did not look inside. These
  // are the shapes NHA actually uses across the V3 families.
  test('a flat message', () => {
    expect(parseAbdmError('{"code":"ABDM-1042","message":"Invalid OTP"}', 400)).toEqual({
      code: 'ABDM-1042',
      message: 'Invalid OTP',
    });
  });

  test('a details array — the field-level reason', () => {
    const body = '{"code":"ABDM-1030","details":[{"code":"ABDM-1030","message":"ABHA not found for the given mobile","attribute":"loginId"}]}';
    expect(parseAbdmError(body, 400).message).toBe('ABHA not found for the given mobile');
  });

  test('a nested error object', () => {
    expect(parseAbdmError('{"error":{"code":1000,"message":"Session expired"}}', 401).message).toBe('Session expired');
  });

  test('an errors array', () => {
    expect(parseAbdmError('{"errors":[{"message":"Encrypted value could not be read"}]}', 400).message).toBe(
      'Encrypted value could not be read',
    );
  });

  test('a field-keyed body — the shape the enrolment endpoints really use', () => {
    // Captured verbatim from the sandbox: the reason is the value, the offending field is the key.
    const body = '{"loginId":"Invalid LoginId","timestamp":"2026-08-25 19:31:06"}';
    expect(parseAbdmError(body, 400).message).toBe('Invalid LoginId');
  });

  test('a timestamp is never mistaken for the reason', () => {
    expect(parseAbdmError('{"timestamp":"2026-08-25 19:31:06"}', 400).message).toBe('ABDM request failed (400)');
  });

  test('a non-JSON body falls back without throwing', () => {
    expect(parseAbdmError('<html>502 Bad Gateway</html>', 502).message).toBe('ABDM request failed (502)');
  });
});
