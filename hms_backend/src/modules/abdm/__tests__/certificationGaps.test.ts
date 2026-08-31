import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { cleanupTenant, dbReady, makeTenant } from '../../../test-api';
import { grantModule } from '../../entitlement/entitlement.service';
import { createPatient } from '../../patient/patient.service';
import { upsertFacilityConfig } from '../abdm.service';
import * as svc from '../abdm.service';
import * as consent from '../consent.service';
import { findPatientByAbha } from '../hiuConsent.service';
import { CreateAbhaAddressBody } from '../abdm.schema';

/**
 * The gaps the official ABDM test-case audit found (ADR-100).
 *
 * Each block below names the certification case it closes, so a future change that breaks one fails
 * with the assessor's own language rather than ours. These are not general-purpose tests of the
 * features — those already exist — they are the specific properties NHA checks.
 */

const CODE = 'ABDMGAPS';
const HIP_ID = 'IN0710-GAPS-001';

let ready = false;
let tenantId = '';

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) return;
  await cleanupTenant(CODE);
  tenantId = (await makeTenant(CODE)).tenantId;
  await grantModule(tenantId, 'patient');
  await grantModule(tenantId, 'abdm');
  await upsertFacilityConfig(tenantId, { hipId: HIP_ID, facilityName: 'Gap Test Hospital' });
});

afterAll(async () => {
  if (!ready) return;
  await pool.query('DELETE FROM abdm_consents WHERE hip_id = $1', [HIP_ID]);
  await cleanupTenant(CODE);
});

describe('TAGGING_UNIQUEPATIENTID_UNIQUEABHANUMBER — one ABHA, one chart', () => {
  test('a second active chart cannot claim the same ABHA number', async ({ skip }) => {
    if (!ready) return skip();
    const first = await createPatient(tenantId, { firstName: 'Original', phone: '9700010001' });
    await pool.query("UPDATE patients SET abha_number = '91-1111-2222-3333' WHERE id = $1", [first.id]);

    const second = await createPatient(tenantId, { firstName: 'Impostor', phone: '9700010002' });
    // Two charts claiming one national identity make linking and discovery unpredictable for a
    // real person — which is exactly why the case is mandatory.
    await expect(
      pool.query("UPDATE patients SET abha_number = '91-1111-2222-3333' WHERE id = $1", [second.id]),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  test('formatting does not create a loophole', async ({ skip }) => {
    if (!ready) return skip();
    const third = await createPatient(tenantId, { firstName: 'Unformatted', phone: '9700010003' });
    // '911111222233 33' and '91-1111-2222-3333' are the same identity; the index normalises.
    await expect(
      pool.query("UPDATE patients SET abha_number = '911111222233 33' WHERE id = $1", [third.id]),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  test('the ABHA address carries the same rule', async ({ skip }) => {
    if (!ready) return skip();
    const a = await createPatient(tenantId, { firstName: 'AddrOne', phone: '9700010004' });
    const b = await createPatient(tenantId, { firstName: 'AddrTwo', phone: '9700010005' });
    await pool.query("UPDATE patients SET abha_address = 'shared@sbx' WHERE id = $1", [a.id]);
    await expect(
      pool.query("UPDATE patients SET abha_address = 'SHARED@sbx' WHERE id = $1", [b.id]),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  test('an inactive chart does not block re-registration', async ({ skip }) => {
    if (!ready) return skip();
    const old = await createPatient(tenantId, { firstName: 'Merged Away', phone: '9700010006' });
    await pool.query("UPDATE patients SET abha_number = '91-4444-5555-6666', status = 'inactive' WHERE id = $1", [old.id]);
    const fresh = await createPatient(tenantId, { firstName: 'Re-registered', phone: '9700010007' });
    // A soft-deleted chart must not permanently burn an ABHA number.
    await pool.query("UPDATE patients SET abha_number = '91-4444-5555-6666' WHERE id = $1", [fresh.id]);
    const row = await pool.query('SELECT abha_number FROM patients WHERE id = $1', [fresh.id]);
    expect(row.rows[0].abha_number).toBe('91-4444-5555-6666');
  });
});

describe('CRT_ABHA_106 — resend OTP, at most twice, sixty seconds apart', () => {
  async function startedTransaction(): Promise<string> {
    const started = await svc.startAadhaarEnrolment(tenantId, { aadhaar: '111122223333', consentGiven: true });
    return started.transactionId;
  }

  test('a resend inside sixty seconds is refused', async ({ skip }) => {
    if (!ready) return skip();
    const transactionId = await startedTransaction();
    await expect(
      svc.resendOtp(tenantId, { transactionId, aadhaar: '111122223333' }),
    ).rejects.toThrow(/wait \d+ more second/i);
  });

  test('two resends are allowed, a third is not', async ({ skip }) => {
    if (!ready) return skip();
    const transactionId = await startedTransaction();
    const age = (seconds: number) =>
      pool.query(`UPDATE abdm_transactions SET last_otp_at = now() - interval '${seconds} seconds' WHERE id = $1`, [
        transactionId,
      ]);

    await age(90);
    const first = await svc.resendOtp(tenantId, { transactionId, aadhaar: '111122223333' });
    expect(first.resendsLeft).toBe(1);

    await age(90);
    const second = await svc.resendOtp(tenantId, { transactionId, aadhaar: '111122223333' });
    expect(second.resendsLeft).toBe(0);

    await age(90);
    // UIDAI caps how many OTPs a number receives in a day; the third resend would spend somebody's
    // allowance for a verification that is clearly not working.
    await expect(svc.resendOtp(tenantId, { transactionId, aadhaar: '111122223333' })).rejects.toThrow(
      /three times|start the verification again/i,
    );
  });

  test('the limit lives on the transaction, not the browser', async ({ skip }) => {
    if (!ready) return skip();
    const transactionId = await startedTransaction();
    const row = await pool.query('SELECT otp_sends, last_otp_at FROM abdm_transactions WHERE id = $1', [transactionId]);
    // A reloaded page or a second tab cannot reset this.
    expect(row.rows[0].otp_sends).toBe(1);
    expect(row.rows[0].last_otp_at).toBeTruthy();
  });

  test('resending without an identifier is refused rather than guessed', async ({ skip }) => {
    if (!ready) return skip();
    const transactionId = await startedTransaction();
    await pool.query("UPDATE abdm_transactions SET last_otp_at = now() - interval '90 seconds' WHERE id = $1", [
      transactionId,
    ]);
    // We never stored the Aadhaar, so there is nothing to replay — and that is the point.
    await expect(svc.resendOtp(tenantId, { transactionId })).rejects.toThrow(/Re-enter the Aadhaar or mobile/i);
  });

  test('the audit records the attempt, never the identifier', async ({ skip }) => {
    if (!ready) return skip();
    const audit = await pool.query(
      "SELECT metadata FROM audit_log WHERE tenant_id = $1 AND action = 'abdm.otp.resent' ORDER BY created_at DESC LIMIT 1",
      [tenantId],
    );
    const metadata = JSON.stringify(audit.rows[0].metadata);
    expect(metadata).toContain('attempt');
    expect(metadata).not.toContain('111122223333');
  });
});

describe('HIP_INIT_GRANT / REVOKE / EXPIRE_CONSENT — "seen in HMIS"', () => {
  const artefact = (consentId: string) => ({
    consentId,
    abhaAddress: 'seen@sbx',
    hipId: HIP_ID,
    hiuId: 'HIU-WATCHER-1',
    hiTypes: ['OPConsultation'],
    accessMode: 'VIEW',
    dataEraseAt: '2030-01-01T00:00:00.000Z',
    grantedAt: new Date().toISOString(),
  });

  test('a granted consent is visible to an operator', async ({ skip }) => {
    if (!ready) return skip();
    await consent.recordConsentGrant(artefact('seen-grant-1'));
    const held = await consent.listConsents(tenantId);
    // The case's expected result is "Consent request seen in HMIS" — visibility, not just storage.
    expect(held.some((c) => c.consentId === 'seen-grant-1')).toBe(true);
  });

  test('revoking removes it from the live list AND records it in the history', async ({ skip }) => {
    if (!ready) return skip();
    await consent.recordConsentGrant(artefact('seen-revoke-1'));
    await consent.revokeConsent(HIP_ID, 'seen-revoke-1');

    const held = await consent.listConsents(tenantId);
    expect(held.some((c) => c.consentId === 'seen-revoke-1')).toBe(false);

    // The artefact is the permission and it is destroyed (ADR-087); the history is the record that
    // it existed and ended, holds metadata only, and is never deleted. That is what makes a
    // revocation watchable rather than merely correct.
    const history = await consent.consentHistory(tenantId);
    const entry = history.find((h) => h.consentId === 'seen-revoke-1' && h.event === 'revoked');
    expect(entry).toBeTruthy();
  });

  test('an expiry is distinguishable from a revocation in the history', async ({ skip }) => {
    if (!ready) return skip();
    await consent.recordConsentGrant(artefact('seen-expire-1'));
    await consent.expireConsent(HIP_ID, 'seen-expire-1');

    const history = await consent.consentHistory(tenantId);
    // "Expired" and "revoked" are different incidents and an assessor must be able to tell them apart.
    expect(history.some((h) => h.consentId === 'seen-expire-1' && h.event === 'expired')).toBe(true);
  });

  test('the history carries no clinical content', async ({ skip }) => {
    if (!ready) return skip();
    const history = await consent.consentHistory(tenantId);
    expect(JSON.stringify(history)).not.toMatch(/diagnos|prescription text|observation/i);
  });
});

describe('HIU_FLOW_101 — find a patient by ABHA, and say whether it is usable', () => {
  test('a verified ABHA address is found and ready', async ({ skip }) => {
    if (!ready) return skip();
    const p = await createPatient(tenantId, { firstName: 'Lookup', lastName: 'Ready', phone: '9700020001' });
    await pool.query(
      "UPDATE patients SET abha_address = 'lookup.ready@sbx', abha_number = '91-7777-8888-9999', abha_verified_at = now() WHERE id = $1",
      [p.id],
    );

    const byAddress = await findPatientByAbha(tenantId, 'lookup.ready@sbx');
    expect(byAddress.outcome).toBe('verified');
    expect(byAddress.patient?.id).toBe(p.id);
  });

  test('the number finds the same person, whatever the formatting', async ({ skip }) => {
    if (!ready) return skip();
    // '91-7777-8888-9999' and '91777788889999' are one identity, not two lookups.
    const spaced = await findPatientByAbha(tenantId, '91 7777 8888 9999');
    expect(spaced.outcome).toBe('verified');
    expect(spaced.patient?.name).toBe('Lookup Ready');
  });

  test('an unverified ABHA is found but named as unusable', async ({ skip }) => {
    if (!ready) return skip();
    const p = await createPatient(tenantId, { firstName: 'Typed', lastName: 'Only', phone: '9700020002' });
    await pool.query("UPDATE patients SET abha_address = 'typed.only@sbx' WHERE id = $1", [p.id]);

    const result = await findPatientByAbha(tenantId, 'typed.only@sbx');
    // Before this existed, a walk-in in exactly this state could not be searched at all — the
    // request simply refused with no way forward.
    expect(result.outcome).toBe('unverified');
    expect(result.patient?.id).toBe(p.id);
    expect(result.nextStep).toMatch(/verify it from the patient chart/i);
  });

  test('an ABHA we do not hold says so, and says what to do', async ({ skip }) => {
    if (!ready) return skip();
    const result = await findPatientByAbha(tenantId, 'stranger@sbx');
    expect(result.outcome).toBe('not_found');
    expect(result.patient).toBeUndefined();
    expect(result.nextStep).toMatch(/register the patient|verify their ABHA/i);
  });

  test('another tenant’s patient is not findable', async ({ skip }) => {
    if (!ready) return skip();
    const other = await makeTenant(`${CODE}X`);
    await grantModule(other.tenantId, 'patient');
    const result = await findPatientByAbha(other.tenantId, 'lookup.ready@sbx');
    expect(result.outcome).toBe('not_found');
    await cleanupTenant(`${CODE}X`);
  });
});

/**
 * CRT_ABHA_112 — the ABHA address policy, enforced where the case says to enforce it.
 *
 * The workbook is unusually specific: 8–18 characters, at most one dot and one underscore, neither
 * at the start nor the end, alphanumeric otherwise, and the rules *"to be set at the API level"*.
 * Until this existed the API accepted 4 to 80 characters of anything including `@` and `-`, so a
 * rejected address came back from ABDM as a failure the receptionist could not act on.
 *
 * Pure validation — no database, no gateway — so these run everywhere.
 */
describe('CRT_ABHA_112 — the ABHA address policy is enforced at the API', () => {
  const ok = (v: string) => CreateAbhaAddressBody.safeParse({ transactionId: TXN, abhaAddress: v }).success;
  const TXN = '00000000-0000-4000-8000-000000000000';

  test('accepts an address that follows the policy', () => {
    expect(ok('kishore123')).toBe(true);
    expect(ok('kishore.k12')).toBe(true);
    expect(ok('kishore_k12')).toBe(true);
    expect(ok('kishore.k_12')).toBe(true); // one dot AND one underscore is allowed
  });

  test('accepts ABDM’s own suggestion when it arrives already qualified', () => {
    // The registry returns some suggestions as `local@sbx`; validating the whole string would
    // reject the registry's own answer, which is the worst possible false positive here.
    expect(ok('kishore123@sbx')).toBe(true);
  });

  test('enforces the length bounds', () => {
    expect(ok('short12')).toBe(false); // 7
    expect(ok('a2345678')).toBe(true); // 8, the floor
    expect(ok('a23456789012345678')).toBe(true); // 18, the ceiling
    expect(ok('a234567890123456789')).toBe(false); // 19
  });

  test('allows at most one dot and one underscore', () => {
    expect(ok('kis.ho.re12')).toBe(false);
    expect(ok('kis_ho_re12')).toBe(false);
  });

  test('refuses a separator at the start or the end', () => {
    expect(ok('.kishore12')).toBe(false);
    expect(ok('kishore12.')).toBe(false);
    expect(ok('_kishore12')).toBe(false);
    expect(ok('kishore12_')).toBe(false);
  });

  test('refuses characters the policy does not list', () => {
    // Both were accepted by the previous rule, and neither is in NHA's list.
    expect(ok('kishore-k12')).toBe(false);
    expect(ok('kishore k12')).toBe(false);
  });
});
