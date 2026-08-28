import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { api, cleanupTenant, dbReady, makeTenant, TEST_PASSWORD, type TestTenant } from '../../../test-api';
import { pool } from '../../../db/client';
import { LOCKOUT_THRESHOLD } from '../lockout';

/**
 * Per-account brute-force lockout over HTTP (ADR-082, SECURITY-AUDIT.md H-3,
 * testcases.md §1 AUTH-LOCK-*).
 *
 * `lockout.test.ts` proves the policy arithmetic. This proves the endpoint behaves the way
 * the finding required: repeated failures against ONE account stop working regardless of how
 * politely the caller is pacing themselves, the refusal does not tell a stranger that the
 * account exists, and a defender can see it in the audit trail.
 *
 * Its own tenant, because these tests deliberately lock accounts.
 */

const CODE = 'APILOCK';
const WRONG = 'DefinitelyNotTheRightOne#9';
let ready = false;
let tenant: TestTenant;

async function attempt(password: string) {
  return api().post('/api/v1/auth/login').send({ orgCode: CODE, email: tenant.users.cashier, password });
}

async function userRow() {
  const res = await pool.query(
    'SELECT failed_login_attempts, locked_until FROM users WHERE tenant_id = $1 AND email = $2',
    [tenant.tenantId, tenant.users.cashier],
  );
  return res.rows[0] as { failed_login_attempts: number; locked_until: Date | null };
}

async function auditActions(): Promise<string[]> {
  const res = await pool.query(
    'SELECT action FROM audit_log WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 25',
    [tenant.tenantId],
  );
  return res.rows.map((r: { action: string }) => r.action);
}

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) {
    console.warn('[lockout.api] skipping — no database');
    return;
  }
  await cleanupTenant(CODE);
  tenant = await makeTenant(CODE);
}, 60_000);

afterAll(async () => {
  if (ready) await cleanupTenant(CODE);
});

describe('account lockout', () => {
  test('consecutive failures lock the account, and the lock survives a correct password', async ({ skip }) => {
    if (!ready) return skip();

    for (let i = 0; i < LOCKOUT_THRESHOLD; i += 1) {
      const res = await attempt(WRONG);
      expect(res.status).toBe(401);
    }

    const state = await userRow();
    expect(state.failed_login_attempts).toBe(LOCKOUT_THRESHOLD);
    expect(state.locked_until).not.toBeNull();

    // The real user, with the real password, is told why they are being refused.
    const locked = await attempt(TEST_PASSWORD);
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(locked.body.error.message).toMatch(/failed sign-in attempts/i);
    expect(locked.headers['set-cookie']).toBeUndefined();
  });

  test('a wrong password during a lock gets the same generic 401 as any other wrong password', async ({ skip }) => {
    if (!ready) return skip();
    const res = await attempt(WRONG);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid credentials');
  });

  test('attempts made while locked do not extend the lock', async ({ skip }) => {
    if (!ready) return skip();
    const before = await userRow();
    await attempt(WRONG);
    await attempt(WRONG);
    const after = await userRow();
    expect(after.locked_until?.getTime()).toBe(before.locked_until?.getTime());
    expect(after.failed_login_attempts).toBe(before.failed_login_attempts);
  });

  test('the lock and the attempts against it are in the audit trail', async ({ skip }) => {
    if (!ready) return skip();
    const actions = await auditActions();
    expect(actions).toContain('auth.login.locked');
    expect(actions).toContain('auth.login.blocked');
  });

  test('once the lock expires, the right password works again and the streak is cleared', async ({ skip }) => {
    if (!ready) return skip();
    // Fast-forward rather than sleeping for the real lock duration.
    await pool.query(
      "UPDATE users SET locked_until = now() - interval '1 minute' WHERE tenant_id = $1 AND email = $2",
      [tenant.tenantId, tenant.users.cashier],
    );

    const res = await attempt(TEST_PASSWORD);
    expect(res.status).toBe(200);

    const state = await userRow();
    expect(state.failed_login_attempts).toBe(0);
    expect(state.locked_until).toBeNull();
  });

  test('one account being locked never affects another', async ({ skip }) => {
    if (!ready) return skip();
    const other = await api()
      .post('/api/v1/auth/login')
      .send({ orgCode: CODE, email: tenant.users.doctor, password: TEST_PASSWORD });
    expect(other.status).toBe(200);
  });
});
