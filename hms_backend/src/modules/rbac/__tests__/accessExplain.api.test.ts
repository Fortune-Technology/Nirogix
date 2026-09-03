import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  api,
  authed,
  cleanupTenant,
  dbReady,
  login,
  makeTenant,
  type Session,
  type TestTenant,
} from '../../../test-api';

/**
 * Explaining a refusal (ADR-126).
 *
 * The endpoint exists because a 403 that says only "no access" leaves the person who hit it with
 * nothing to do. The three properties worth asserting are the three a refusal screen needs:
 *
 * 1. **Module before permission.** An administrator now holds nearly every permission (ADR-125),
 *    so "you hold `pharmacy.stock.view` but this hospital has no Pharmacy module" is a real and
 *    common state — and telling that person their *role* is short something would send them to
 *    ask for a change that would do nothing.
 * 2. **The roles come from this hospital's own tables**, not from the shipped defaults, so a
 *    custom role appears without anyone hard-coding it.
 * 3. **It leaks nothing.** Which roles exist and what each may do is what an employee is told on
 *    their first day; no patient, no account and no other tenant is named.
 *
 * Skips cleanly with no database.
 */

const CODE = 'ACCESSEXP';

let ready = false;
let tenant: TestTenant;
const sessions: Record<string, Session> = {};

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) {
    console.warn('[accessExplain.api] skipping — no database');
    return;
  }
  await cleanupTenant(CODE);
  // Onboarding grants the default module set, which does NOT include `abdm`. That absence is
  // the whole point of the module case below: a hospital that has not bought ABDM.
  tenant = await makeTenant(CODE, 'Access Explain Hospital');
  for (const role of ['org_admin', 'receptionist'] as const) {
    sessions[role] = await login(CODE, tenant.users[role]!);
  }
}, 120_000);

afterAll(async () => {
  if (ready) await cleanupTenant(CODE);
}, 120_000);

const explain = (session: Session, permission: string) =>
  authed(session).get(`/api/v1/rbac/access?permission=${encodeURIComponent(permission)}`);

describe('GET /rbac/access (ADR-126)', () => {
  test('a permission the caller holds reads as granted', async ({ skip }) => {
    if (!ready) return skip();
    const res = await explain(sessions.receptionist!, 'patient.record.create');
    expect(res.status).toBe(200);
    expect(res.body.granted).toBe(true);
    expect(res.body.reason).toBe('granted');
    expect(res.body.permission).toEqual({
      key: 'patient.record.create',
      label: 'Register patients',
    });
    expect(res.body.module).toEqual({ key: 'patient', name: expect.any(String), enabled: true });
  });

  test('a missing permission names the roles that hold it', async ({ skip }) => {
    if (!ready) return skip();
    const res = await explain(sessions.receptionist!, 'audit.log.view');
    expect(res.status).toBe(200);
    expect(res.body.granted).toBe(false);
    expect(res.body.reason).toBe('permission_missing');
    expect(res.body.permission.label).toBe('View the audit log');
    const roles = res.body.grantedByRoles.map((r: { key: string }) => r.key);
    expect(roles).toContain('org_admin');
    expect(roles).not.toContain('receptionist');
    // Platform Core: no module to blame, so the refusal is squarely about the role.
    expect(res.body.module).toBeNull();
  });

  test('a disabled module outranks the permission, even for an administrator', async ({ skip }) => {
    if (!ready) return skip();
    const res = await explain(sessions.org_admin!, 'abdm.facility.view');
    expect(res.status).toBe(200);
    // The administrator DOES hold `abdm.facility.view` (ADR-125) and still has no access, which
    // is exactly the case a permission-only message would describe wrongly.
    expect(res.body.reason).toBe('module_not_enabled');
    expect(res.body.granted).toBe(false);
    expect(res.body.module).toEqual({ key: 'abdm', name: expect.any(String), enabled: false });
  });

  test('an unknown key still explains itself rather than failing', async ({ skip }) => {
    if (!ready) return skip();
    const res = await explain(sessions.org_admin!, 'something.nobody.declared');
    expect(res.status).toBe(200);
    expect(res.body.granted).toBe(false);
    expect(res.body.permission.label).toBeTruthy();
    // Only the wildcard role, which grants everything including keys that do not exist yet.
    expect(res.body.grantedByRoles.map((r: { key: string }) => r.key)).toEqual(['super_admin']);
  });

  test('🔒 it needs a session', async ({ skip }) => {
    if (!ready) return skip();
    const res = await api().get('/api/v1/rbac/access?permission=patient.record.view');
    expect(res.status).toBe(401);
  });

  test('🔒 it describes only the caller’s own hospital', async ({ skip }) => {
    if (!ready) return skip();
    const res = await explain(sessions.receptionist!, 'audit.log.view');
    const body = JSON.stringify(res.body);
    // No user, no patient, no other tenant — only permission, module and role names.
    expect(Object.keys(res.body).sort()).toEqual(
      ['grantedByRoles', 'granted', 'module', 'permission', 'reason'].sort(),
    );
    expect(body).not.toContain('@');
    expect(body).not.toContain(tenant.tenantId);
  });
});
