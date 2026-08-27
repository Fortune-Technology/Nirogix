import supertest from 'supertest';
import { createApp } from './app';
import { pool } from './db/client';
import { seedPermissionCatalog } from './modules/rbac/rbac.service';
import { onboardTenant } from './modules/admin/admin.service';
import { createUser } from './modules/user/user.service';
import { hashPassword } from './modules/auth/password';

/**
 * Shared harness for the API (HTTP) test level.
 *
 * The service-level suites call functions directly with an explicit `tenantId`, which
 * proves the business rules but skips everything the boundary does: the Bearer check,
 * principal type, tenant resolution from the token, `requireModule`/`requirePermission`,
 * Zod validation and the error → status mapping. These tests go through Express so that
 * layer is exercised for real — a frontend guard is UX, the API is the boundary.
 *
 * Every helper is tenant-scoped and takes a caller-supplied code, so suites stay isolated
 * and re-runnable (a crashed run is cleaned by the next `beforeAll`).
 */

/** A supertest client bound to a fresh app instance (no port is bound). */
export function api() {
  return supertest(createApp());
}

/** The password every harness-created account gets. Never a real credential. */
export const TEST_PASSWORD = 'TestPass#12345';

export type Session = { token: string; userId: string; tenantId: string };

/** True when a Postgres is reachable — suites skip cleanly without one, as the rest do. */
export async function dbReady(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Signs in over HTTP and returns the access token. Deliberately uses the real endpoint
 * rather than minting a token directly: an API test that forges its own token would not
 * notice if login itself broke.
 */
export async function login(orgCode: string, email: string, password = TEST_PASSWORD): Promise<Session> {
  const res = await api().post('/api/v1/auth/login').send({ orgCode, email, password });
  if (res.status !== 200) {
    throw new Error(`login failed for ${email}@${orgCode}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.accessToken, userId: res.body.user.id, tenantId: res.body.user.tenantId };
}

/** `authed(session).get('/api/v1/...')` — attaches the Bearer header. */
export function authed(session: Session) {
  const request = api();
  return {
    get: (url: string) => request.get(url).set('Authorization', `Bearer ${session.token}`),
    post: (url: string) => request.post(url).set('Authorization', `Bearer ${session.token}`),
    patch: (url: string) => request.patch(url).set('Authorization', `Bearer ${session.token}`),
    put: (url: string) => request.put(url).set('Authorization', `Bearer ${session.token}`),
    delete: (url: string) => request.delete(url).set('Authorization', `Bearer ${session.token}`),
  };
}

export type TestTenant = {
  tenantId: string;
  code: string;
  adminEmail: string;
  /** Role key → email. Keyed by the role union so `users.doctor` is a string, not `string | undefined`. */
  users: Record<StaffRole, string>;
};

/** The hospital roles the seeders create; the harness mirrors them so role tests are realistic. */
export const STAFF_ROLES = [
  'org_admin',
  'branch_admin',
  'doctor',
  'receptionist',
  'pharmacist',
  'lab_technician',
  'cashier',
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * Onboards a tenant and creates one account per staff role, all with `TEST_PASSWORD`.
 * Emails are derived from the tenant code so two tenants in the same test never collide.
 */
export async function makeTenant(code: string, name = `${code} Test Hospital`): Promise<TestTenant> {
  await seedPermissionCatalog();
  const domain = `${code.toLowerCase()}.test`;
  const adminEmail = `admin@${domain}`;
  const result = await onboardTenant({
    code,
    name,
    admin: { email: adminEmail, fullName: `${code} Admin` },
  });
  const tenantId = result.tenant.id;

  // Onboarding mints a one-time temp password for the first org_admin (it is shown to the
  // operator, not returned to us in a usable form for repeat runs). Replace the hash with the
  // harness password so a suite can sign in as the onboarded admin too.
  await pool.query('UPDATE users SET password_hash = $1 WHERE tenant_id = $2 AND email = $3', [
    await hashPassword(TEST_PASSWORD),
    tenantId,
    adminEmail,
  ]);

  const users = {} as Record<StaffRole, string>;
  for (const roleKey of STAFF_ROLES) {
    const email = roleKey === 'org_admin' ? `orgadmin@${domain}` : `${roleKey}@${domain}`;
    await createUser(tenantId, {
      email,
      fullName: `${code} ${roleKey}`,
      roleKey,
      password: TEST_PASSWORD,
    });
    users[roleKey] = email;
  }
  return { tenantId, code, adminEmail, users };
}

/**
 * Waits for in-flight audit writes to stop arriving.
 *
 * `auditMiddleware` writes on `res.on('finish')` with `void writeAudit(...)` — deliberate, so
 * auditing never delays a reply — but supertest resolves as soon as the response arrives. A
 * suite whose last calls were mutations can therefore still have audit inserts in flight, and
 * `audit_log.tenant_id` is ON DELETE RESTRICT, so teardown fails with a foreign-key violation
 * that has nothing to do with the test. Polls until the row count stops changing.
 */
async function settleAuditWrites(tenantId: string): Promise<void> {
  let previous = -1;
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const rows = await pool.query('SELECT count(*)::int AS c FROM audit_log WHERE tenant_id = $1', [tenantId]);
    const current = Number(rows.rows[0].c);
    if (current === previous) return;
    previous = current;
  }
}

/**
 * Deletes everything belonging to a tenant, newest-dependency first. Mirrors the per-suite
 * cleanups the service tests already carry; kept here so new suites do not each restate the
 * table list. The audit trigger is append-only by design, so it is disabled for the delete.
 */
export async function cleanupTenant(code: string): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [code])).rows[0];
  if (!t) return;
  await settleAuditWrites(t.id);
  await pool.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [t.id]);
  await pool.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_change');
  for (const table of [
    // notification_log.tenant_id is ON DELETE RESTRICT (invariant #6 — sends are never physically
    // deleted in production); the suite must clear it before the tenant. Business flows now emit
    // notifications (welcome/appointment/payment/lab/patient emails, ADR-086).
    'notification_log',
    // ABDM first: `abdm_transactions.patient_id` is ON DELETE RESTRICT, so it has to go before
    // the charts it points at (ADR-084).
    'abdm_hiu_records', 'abdm_hiu_data_transfers', 'abdm_hiu_consents', 'abdm_hiu_consent_requests',
    'abdm_data_transfers', 'abdm_link_requests', 'abdm_care_contexts', 'abdm_consents', 'abdm_link_tokens', 'abdm_transactions', 'abdm_facility_config',
    'payments', 'invoice_line_items', 'dispenses', 'drug_batches', 'drugs',
    'lab_results', 'lab_orders', 'lab_tests', 'prescriptions', 'diagnoses', 'encounters',
    'visits', 'invoices', 'appointments', 'patients',
    'practitioner_roles', 'providers', 'departments',
    'user_roles', 'role_permissions', 'roles', 'tenant_entitlements', 'branches', 'users',
  ]) {
    await pool.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [t.id]);
  }
  await pool.query('DELETE FROM tenants WHERE id = $1', [t.id]);
}
