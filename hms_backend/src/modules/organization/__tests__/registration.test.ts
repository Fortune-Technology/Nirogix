import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { seedPermissionCatalog } from '../../rbac/rbac.service';
import { onboardTenant } from '../../admin/admin.service';
import {
  approveRegistrationRequest,
  getRegistrationSettings,
  listRegistrationRequests,
  regenerateRegistrationToken,
  rejectRegistrationRequest,
  resolveRegistrationToken,
  setSelfRegistration,
  submitRegistrationRequest,
} from '../registration.service';

/**
 * Patient self-registration by QR (ADR-056).
 *
 * The tests worth having here are the ones that fail loudly if the security model slips:
 * a token resolves to exactly one hospital and never another, a submission never becomes
 * a patient on its own, and the toggle is enforced on the server rather than only hidden
 * in the form. Skips if no database is reachable, like the other service tests.
 */

/**
 * Assert the HTTP status an `AppError` carries — not merely that something threw.
 * The distinction matters here: 404-rather-than-403 on every public failure is the
 * whole point of "never reveal which hospitals exist".
 */
/** The one pending request, asserted to exist so the test fails on the fact, not a TypeError. */
async function onlyRequest(tenantId: string, status: string) {
  const rows = await listRegistrationRequests(tenantId, status);
  const row = rows[0];
  if (!row) throw new Error(`expected a ${status} registration request for ${tenantId}`);
  return row;
}

async function expectStatus(promise: Promise<unknown>, statusCode: number): Promise<void> {
  await promise.then(
    () => expect.fail(`expected the call to fail with ${statusCode}`),
    (err: { statusCode?: number }) => expect(err.statusCode).toBe(statusCode),
  );
}

const CODE_A = 'REGTESTA';
const CODE_B = 'REGTESTB';
let ready = false;
let tenantA = '';
let tenantB = '';
let adminA = '';
let adminB = '';

async function cleanupOne(code: string): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [code])).rows[0];
  if (!t) return;
  await pool.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM notification_log WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [t.id]);
  await pool.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_change');
  for (const table of [
    'registration_requests',
    'patients',
    'organization_profile',
    'tenant_branding',
    'user_permission_overrides',
    'user_roles',
    'role_permissions',
    'roles',
    'tenant_entitlements',
    'branches',
    'users',
  ]) {
    await pool.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [t.id]);
  }
  await pool.query('DELETE FROM tenants WHERE id = $1', [t.id]);
}

beforeAll(async () => {
  try {
    await pool.query('SELECT 1');
    await seedPermissionCatalog();
    await cleanupOne(CODE_A);
    await cleanupOne(CODE_B);
    const a = await onboardTenant({
      code: CODE_A,
      name: 'Reg Test Hospital',
      admin: { email: 'admin@regtesta.example', fullName: 'Reg Admin A' },
    });
    const b = await onboardTenant({
      code: CODE_B,
      name: 'Reg Other Hospital',
      admin: { email: 'admin@regtestb.example', fullName: 'Reg Admin B' },
    });
    tenantA = a.tenant.id;
    tenantB = b.tenant.id;
    adminA = (await pool.query('SELECT id FROM users WHERE email = $1', ['admin@regtesta.example'])).rows[0].id;
    adminB = (await pool.query('SELECT id FROM users WHERE email = $1', ['admin@regtestb.example'])).rows[0].id;
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[registration] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  if (ready) {
    await cleanupOne(CODE_A);
    await cleanupOne(CODE_B);
  }
});

describe('self-registration settings', () => {
  test('is off, and has no token, until a hospital opts in', async ({ skip }) => {
    if (!ready) return skip();
    const s = await getRegistrationSettings(tenantA);
    expect(s.enabled).toBe(false);
    expect(s.token).toBeNull();
    expect(s.pendingCount).toBe(0);
  });

  test('enabling mints a token, and each hospital gets its own', async ({ skip }) => {
    if (!ready) return skip();
    const a = await setSelfRegistration(tenantA, true, adminA);
    const b = await setSelfRegistration(tenantB, true, adminB);
    expect(a.enabled).toBe(true);
    expect(a.token).toBeTruthy();
    expect(a.token!.length).toBeGreaterThanOrEqual(24);
    expect(a.token).not.toBe(b.token);
  });

  test('disabling keeps the token, so pausing does not mean reprinting posters', async ({ skip }) => {
    if (!ready) return skip();
    const before = await getRegistrationSettings(tenantA);
    const off = await setSelfRegistration(tenantA, false, adminA);
    expect(off.enabled).toBe(false);
    expect(off.token).toBe(before.token);
    const on = await setSelfRegistration(tenantA, true, adminA);
    expect(on.token).toBe(before.token);
  });

  test('regenerating retires the printed QR', async ({ skip }) => {
    if (!ready) return skip();
    const before = await getRegistrationSettings(tenantA);
    const after = await regenerateRegistrationToken(tenantA, adminA);
    expect(after.token).not.toBe(before.token);
    // The old poster now fails exactly like a typo would.
    await expect(resolveRegistrationToken(before.token!)).rejects.toThrow();
  });

  test('enabling and regenerating are audited at notice', async ({ skip }) => {
    if (!ready) return skip();
    const { rows } = await pool.query(
      "SELECT action FROM audit_log WHERE tenant_id = $1 AND action LIKE 'patient.registration.%'",
      [tenantA],
    );
    const actions = rows.map((r: { action: string }) => r.action);
    expect(actions).toContain('patient.registration.enabled');
    expect(actions).toContain('patient.registration.disabled');
    expect(actions).toContain('patient.registration.token_regenerated');
  });
});

describe('token resolution', () => {
  test('resolves to the hospital that owns it, and reveals nothing else', async ({ skip }) => {
    if (!ready) return skip();
    const a = await getRegistrationSettings(tenantA);
    const { tenantId, ctx } = await resolveRegistrationToken(a.token!);
    expect(tenantId).toBe(tenantA);
    expect(ctx.hospitalName).toBe('Reg Test Hospital');
    // Only a name, a city and the on/off state — no identifiers, no contact details.
    expect(Object.keys(ctx).sort()).toEqual(['city', 'enabled', 'hospitalName']);
  });

  /** The invariant the whole feature exists to hold: QR A can never reach Tenant B. */
  test('a hospital’s token never resolves to another hospital', async ({ skip }) => {
    if (!ready) return skip();
    const [a, b] = await Promise.all([getRegistrationSettings(tenantA), getRegistrationSettings(tenantB)]);
    expect((await resolveRegistrationToken(a.token!)).tenantId).toBe(tenantA);
    expect((await resolveRegistrationToken(b.token!)).tenantId).toBe(tenantB);
    expect(a.token).not.toBe(b.token);
  });

  test('an unknown, short or empty token fails identically', async ({ skip }) => {
    if (!ready) return skip();
    for (const bad of ['', 'x', 'not-a-real-token-but-long-enough-to-pass']) {
      await expectStatus(resolveRegistrationToken(bad), 404);
    }
  });
});

describe('public submission', () => {
  test('creates a request and no patient', async ({ skip }) => {
    if (!ready) return skip();
    const { token } = await getRegistrationSettings(tenantA);
    await submitRegistrationRequest(token!, { firstName: 'Meera', lastName: 'Joshi', phone: '+919820000001' });

    const pending = await listRegistrationRequests(tenantA, 'pending');
    expect(pending).toHaveLength(1);
    expect(pending[0]?.firstName).toBe('Meera');

    const patients = await pool.query('SELECT id FROM patients WHERE tenant_id = $1', [tenantA]);
    expect(patients.rows).toHaveLength(0);
  });

  test('lands in the hospital that owns the token, not any other', async ({ skip }) => {
    if (!ready) return skip();
    expect(await listRegistrationRequests(tenantB, 'pending')).toHaveLength(0);
  });

  test('is refused while the hospital has self-registration switched off', async ({ skip }) => {
    if (!ready) return skip();
    const { token } = await setSelfRegistration(tenantA, false, adminA);
    await expectStatus(submitRegistrationRequest(token!, { firstName: 'Should', phone: '+919820000002' }), 404);
    expect(await listRegistrationRequests(tenantA, 'pending')).toHaveLength(1);
    await setSelfRegistration(tenantA, true, adminA);
  });
});

describe('review', () => {
  test('approving creates the patient and keeps the request as its provenance', async ({ skip }) => {
    if (!ready) return skip();
    const req = await onlyRequest(tenantA, 'pending');
    const { patientId } = await approveRegistrationRequest(tenantA, req.id, adminA);

    const patient = await pool.query('SELECT tenant_id, first_name FROM patients WHERE id = $1', [patientId]);
    expect(patient.rows[0].tenant_id).toBe(tenantA);
    expect(patient.rows[0].first_name).toBe('Meera');

    const approved = await listRegistrationRequests(tenantA, 'approved');
    expect(approved[0]?.patientId).toBe(patientId);
    expect(await listRegistrationRequests(tenantA, 'pending')).toHaveLength(0);
  });

  test('approving the same request twice is refused', async ({ skip }) => {
    if (!ready) return skip();
    const req = await onlyRequest(tenantA, 'approved');
    await expectStatus(approveRegistrationRequest(tenantA, req.id, adminA), 409);
  });

  /** A hospital must not be able to act on another hospital's queue even with a real id. */
  test('one hospital cannot approve another hospital’s request', async ({ skip }) => {
    if (!ready) return skip();
    const { token } = await getRegistrationSettings(tenantA);
    await submitRegistrationRequest(token!, { firstName: 'Arjun', phone: '+919820000003' });
    const req = await onlyRequest(tenantA, 'pending');

    await expectStatus(approveRegistrationRequest(tenantB, req.id, adminB), 404);
    expect(await listRegistrationRequests(tenantA, 'pending')).toHaveLength(1);
  });

  test('rejecting keeps the row, marks it, and creates no patient', async ({ skip }) => {
    if (!ready) return skip();
    const req = await onlyRequest(tenantA, 'pending');
    const before = await pool.query('SELECT count(*)::int AS n FROM patients WHERE tenant_id = $1', [tenantA]);

    await rejectRegistrationRequest(tenantA, req.id, 'Duplicate of an existing record', adminA);

    const rejected = await listRegistrationRequests(tenantA, 'rejected');
    expect(rejected.map((r) => r.id)).toContain(req.id);
    expect(rejected[0]?.rejectionReason).toBe('Duplicate of an existing record');

    const after = await pool.query('SELECT count(*)::int AS n FROM patients WHERE tenant_id = $1', [tenantA]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  test('approving is audited at notice against the created patient', async ({ skip }) => {
    if (!ready) return skip();
    const { rows } = await pool.query(
      "SELECT severity FROM audit_log WHERE tenant_id = $1 AND action = 'patient.registration.approved'",
      [tenantA],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].severity).toBe('notice');
  });
});
