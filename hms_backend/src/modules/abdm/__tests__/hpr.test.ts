import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { pool } from '../../../db/client';
import { cleanupTenant, dbReady, makeTenant } from '../../../test-api';
import { grantModule } from '../../entitlement/entitlement.service';
import * as registry from '../registryGateway';
import * as hpr from '../hpr.service';

/**
 * Enrolling a clinician in the Healthcare Professional Registry (ADR-097).
 *
 * Two failures here would be serious, and everything below exists to pin them:
 *
 * 1. **An Aadhaar number surviving the call.** It is encrypted, sent and forgotten; nothing on the
 *    row, in the response, or in the audit entry may contain it. A test that only checked the happy
 *    path would never notice it leaking into a column.
 * 2. **A second HPR id for somebody who already has one.** That is not a duplicate row — it is a
 *    second national identity for a real person, and unpicking it is somebody's afternoon at a
 *    government helpdesk.
 *
 * The registry client is stubbed rather than called. These are live government endpoints that mint
 * real identities; a suite that enrolled a fictional doctor on every `npm test` would be indefensible.
 * What is asserted is our half — what we send, what we keep, and what we refuse.
 */

const CODE = 'ABDMHPR';
/** Structurally valid, belongs to nobody. Never sent anywhere — the client is stubbed. */
const TEST_AADHAAR = '999999999999';

let ready = false;
let tenantId = '';
let providerId = '';

/** Records what the service would have sent, so the payload itself can be inspected. */
function stubRegistry(responses: Record<string, unknown>): {
  calls: Array<{ path: string; body: unknown }>;
} {
  const calls: Array<{ path: string; body: unknown }> = [];
  vi.spyOn(registry, 'registryPost').mockImplementation(async (path: string, body: unknown) => {
    calls.push({ path, body });
    const key = Object.keys(responses).find((k) => path.includes(k));
    return (key ? responses[key] : {}) as never;
  });
  return { calls };
}

const enrolmentRow = async () =>
  (
    await pool.query('SELECT * FROM abdm_staff_hpr WHERE tenant_id = $1 AND provider_id = $2', [
      tenantId,
      providerId,
    ])
  ).rows[0];

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) return;
  await cleanupTenant(CODE);
  tenantId = (await makeTenant(CODE)).tenantId;
  await grantModule(tenantId, 'abdm');
  const doctor = await pool.query(
    `INSERT INTO providers (tenant_id, full_name, is_active) VALUES ($1,'Dr Meera Iyer', true) RETURNING id`,
    [tenantId],
  );
  providerId = doctor.rows[0].id;
});

afterAll(async () => {
  if (!ready) return;
  vi.restoreAllMocks();
  await cleanupTenant(CODE);
});

describe('the Aadhaar never survives the call', () => {
  test('it is encrypted before it leaves, and stored nowhere', async ({ skip }) => {
    if (!ready) return skip();
    const { calls } = stubRegistry({ generateLink: { txnId: 'txn-1' }, checkHpIdAccountExist: {} });

    const started = await hpr.startEnrolment(tenantId, null, {
      providerId,
      aadhaar: TEST_AADHAAR,
      category: 'doctor',
    });
    expect(started.txnId).toBe('txn-1');

    // What went on the wire is ciphertext, not the number.
    const sent = calls.find((c) => c.path.includes('generateLink'))!.body as { aadhaar: string };
    expect(sent.aadhaar).not.toContain(TEST_AADHAAR);
    expect(sent.aadhaar.length).toBeGreaterThan(100);

    // And the row keeps ABDM's reference, never the identity behind it.
    const row = await enrolmentRow();
    expect(JSON.stringify(row)).not.toContain(TEST_AADHAAR);
    expect(row.txn_id).toBe('txn-1');
    vi.restoreAllMocks();
  });

  test('the audit entry records who and what, never the number', async ({ skip }) => {
    if (!ready) return skip();
    const audit = await pool.query(
      "SELECT metadata FROM audit_log WHERE tenant_id = $1 AND action = 'abdm.hpr.enrolment_started' ORDER BY created_at DESC LIMIT 1",
      [tenantId],
    );
    expect(JSON.stringify(audit.rows[0].metadata)).not.toContain(TEST_AADHAAR);
    expect((audit.rows[0].metadata as { category: string }).category).toBe('doctor');
  });

  test('the OTP is encrypted too', async ({ skip }) => {
    if (!ready) return skip();
    const { calls } = stubRegistry({ verifyOTP: {} });
    await hpr.verifyAadhaarOtp(tenantId, { providerId, otp: '123456' });

    const sent = calls.find((c) => c.path.includes('verifyOTP'))!.body as { otp: string };
    // Same rule as M1: the code proves an identity, so it does not travel in the clear.
    expect(sent.otp).not.toBe('123456');
    expect(sent.otp.length).toBeGreaterThan(100);
    vi.restoreAllMocks();
  });
});

describe('never a second national identity', () => {
  test('an existing HPR id is found and recorded instead of minting another', async ({ skip }) => {
    if (!ready) return skip();
    const fresh = await makeTenant(`${CODE}2`);
    await grantModule(fresh.tenantId, 'abdm');
    const doc = await pool.query(
      `INSERT INTO providers (tenant_id, full_name, is_active) VALUES ($1,'Dr Already Listed', true) RETURNING id`,
      [fresh.tenantId],
    );

    stubRegistry({
      generateLink: { txnId: 'txn-dup' },
      checkHpIdAccountExist: { hprIdNumber: '71-1234-5678-9012' },
    });
    const started = await hpr.startEnrolment(fresh.tenantId, null, {
      providerId: doc.rows[0].id,
      aadhaar: TEST_AADHAAR,
      category: 'doctor',
    });

    // The dedup check runs BEFORE anything is created, and its answer is believed.
    expect(started.alreadyRegistered).toBe(true);
    const row = await pool.query('SELECT status, hpr_id FROM abdm_staff_hpr WHERE tenant_id = $1', [
      fresh.tenantId,
    ]);
    expect(row.rows[0].status).toBe('already_registered');
    expect(row.rows[0].hpr_id).toBe('71-1234-5678-9012');

    vi.restoreAllMocks();
    await cleanupTenant(`${CODE}2`);
  });

  test('a registered clinician cannot be enrolled again', async ({ skip }) => {
    if (!ready) return skip();
    await pool.query("UPDATE abdm_staff_hpr SET status = 'registered' WHERE tenant_id = $1", [
      tenantId,
    ]);
    await expect(
      hpr.startEnrolment(tenantId, null, { providerId, aadhaar: TEST_AADHAAR, category: 'doctor' }),
    ).rejects.toThrow(/already holds an HPR id/i);
    await pool.query("UPDATE abdm_staff_hpr SET status = 'aadhaar_verified' WHERE tenant_id = $1", [
      tenantId,
    ]);
  });
});

describe('the resumable chain', () => {
  test('an expired transaction is refused clearly, not three steps later', async ({ skip }) => {
    if (!ready) return skip();
    await pool.query(
      "UPDATE abdm_staff_hpr SET txn_started_at = now() - interval '2 hours' WHERE tenant_id = $1",
      [tenantId],
    );
    await expect(hpr.sendMobileOtp(tenantId, providerId, '9822011122')).rejects.toThrow(/expired/i);
    await pool.query('UPDATE abdm_staff_hpr SET txn_started_at = now() WHERE tenant_id = $1', [
      tenantId,
    ]);
  });

  test('verifying before starting is refused', async ({ skip }) => {
    if (!ready) return skip();
    const fresh = await makeTenant(`${CODE}3`);
    await grantModule(fresh.tenantId, 'abdm');
    const doc = await pool.query(
      `INSERT INTO providers (tenant_id, full_name, is_active) VALUES ($1,'Dr Not Started', true) RETURNING id`,
      [fresh.tenantId],
    );
    await expect(
      hpr.verifyAadhaarOtp(fresh.tenantId, { providerId: doc.rows[0].id, otp: '123456' }),
    ).rejects.toThrow(/Start the enrolment/i);
    await cleanupTenant(`${CODE}3`);
  });

  test('completing mints the id and registers the profile together', async ({ skip }) => {
    if (!ready) return skip();
    await pool.query("UPDATE abdm_staff_hpr SET status = 'mobile_verified' WHERE tenant_id = $1", [
      tenantId,
    ]);
    const { calls } = stubRegistry({
      createHprIdWithPreVerified: { hprIdNumber: '71-9999-8888-7777', token: 'hpr-token' },
      'register-professional-new': {},
    });

    const done = await hpr.completeEnrolment(tenantId, null, {
      providerId,
      email: 'meera@nirogix.test',
      firstName: 'Meera',
      lastName: 'Iyer',
      registrationCouncil: 'Maharashtra Medical Council',
      registrationNumber: 'MMC-2014-11733',
    });

    expect(done.status).toBe('registered');
    expect(done.hprId).toBe('71-9999-8888-7777');
    // Both calls, in order — an id with no council registration behind it is worse than none.
    expect(calls.map((c) => c.path.split('/').pop())).toEqual([
      'createHprIdWithPreVerified',
      'register-professional-new',
    ]);

    // The spent transaction is dropped rather than left to invite a stale retry.
    expect((await enrolmentRow()).txn_id).toBeNull();
    vi.restoreAllMocks();
  });

  test('the verified registration number fills a blank provider field', async ({ skip }) => {
    if (!ready) return skip();
    const provider = await pool.query('SELECT registration_number FROM providers WHERE id = $1', [
      providerId,
    ]);
    // M3's consent requests already need this, and the clinician just proved it to a registry.
    expect(provider.rows[0].registration_number).toBe('MMC-2014-11733');
  });

  test('an existing registration number is never overwritten', async ({ skip }) => {
    if (!ready) return skip();
    const fresh = await makeTenant(`${CODE}4`);
    await grantModule(fresh.tenantId, 'abdm');
    const doc = await pool.query(
      `INSERT INTO providers (tenant_id, full_name, registration_number, is_active)
       VALUES ($1,'Dr Has A Number','HOSPITAL-OWN-123', true) RETURNING id`,
      [fresh.tenantId],
    );
    await pool.query(
      `INSERT INTO abdm_staff_hpr (tenant_id, provider_id, status, txn_id, txn_started_at)
       VALUES ($1,$2,'mobile_verified','txn-x', now())`,
      [fresh.tenantId, doc.rows[0].id],
    );
    stubRegistry({
      createHprIdWithPreVerified: { hprIdNumber: '71-0000-0000-0001' },
      'register-professional-new': {},
    });

    await hpr.completeEnrolment(fresh.tenantId, null, {
      providerId: doc.rows[0].id,
      email: 'x@nirogix.test',
      firstName: 'X',
      registrationCouncil: 'Some Council',
      registrationNumber: 'HPR-VERIFIED-999',
    });

    // A hospital's own records may key on the existing value; replacing it is not our business.
    const after = await pool.query('SELECT registration_number FROM providers WHERE id = $1', [
      doc.rows[0].id,
    ]);
    expect(after.rows[0].registration_number).toBe('HOSPITAL-OWN-123');

    vi.restoreAllMocks();
    await cleanupTenant(`${CODE}4`);
  });
});
