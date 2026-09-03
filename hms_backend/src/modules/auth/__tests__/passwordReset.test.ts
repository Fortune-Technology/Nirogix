import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { pool } from '../../../db/client';
import { runWithTenant } from '../../../db/tenantContext';
import { passwordResetTokens, sessions, users } from '../../../db/schema';
import { seedPermissionCatalog } from '../../rbac/rbac.service';
import { onboardTenant } from '../../admin/admin.service';
import { login, requestPasswordReset, resetPassword } from '../auth.service';
import { hashToken, signPasswordResetToken, tokenExpiry } from '../tokens';

// Forgot-password flow (ADR-081): request creates a hashed single-use row; consume sets the
// new password, kills every outstanding link, and revokes every session. Uses an isolated
// throwaway tenant (same skeleton as user.test.ts). Skips cleanly if no DB.

const CODE = 'A2RESET';
const ADMIN_EMAIL = 'admin@a2reset.example';
let ready = false;
let tenantId = '';
let adminUserId = '';
let tempPassword = '';

async function cleanup(): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [CODE])).rows[0];
  if (!t) return;
  await pool.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM notification_log WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [t.id]);
  await pool.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_change');
  for (const table of [
    'password_reset_tokens',
    'notification_log',
    'sessions',
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
    await cleanup();
    const r = await onboardTenant({
      code: CODE,
      name: 'A2 Reset Hospital',
      admin: { email: ADMIN_EMAIL, fullName: 'A2 Reset Admin' },
    });
    tenantId = r.tenant.id;
    tempPassword = r.admin.tempPassword;
    adminUserId = (
      await runWithTenant(tenantId, (tx) =>
        tx.select({ id: users.id }).from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1),
      )
    )[0]!.id;
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[passwordReset] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  if (ready) await cleanup();
});

// Mints a link exactly the way the service does — signed JWT + hashed row — so the consume
// path is tested end to end without fishing the token out of an email.
async function mintResetToken(userId: string, expiresAt?: Date): Promise<string> {
  const token = signPasswordResetToken({ sub: userId, tid: tenantId });
  await runWithTenant(tenantId, (tx) =>
    tx.insert(passwordResetTokens).values({
      tenantId,
      userId,
      tokenHash: hashToken(token),
      expiresAt: expiresAt ?? tokenExpiry(token),
    }),
  );
  return token;
}

describe('forgot-password flow (ADR-081)', () => {
  test('a request for a real active user creates a hashed token row and audits it', async ({
    skip,
  }) => {
    if (!ready) return skip();
    await requestPasswordReset({ orgCode: CODE, email: ADMIN_EMAIL, client: 'portal' }, {});
    const rows = await runWithTenant(tenantId, (tx) =>
      tx.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, adminUserId)),
    );
    expect(rows.length).toBeGreaterThan(0);
    // Hash-only storage: 64 hex chars, never the token itself.
    expect(rows[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    const audit = await pool.query(
      "SELECT severity FROM audit_log WHERE tenant_id = $1 AND action = 'auth.password.reset.requested'",
      [tenantId],
    );
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  test('a request for an unknown email is uniform: no throw, no token row', async ({ skip }) => {
    if (!ready) return skip();
    const before = await runWithTenant(tenantId, (tx) => tx.select().from(passwordResetTokens));
    await expect(
      requestPasswordReset(
        { orgCode: CODE, email: 'nobody@a2reset.example', client: 'portal' },
        {},
      ),
    ).resolves.toBeUndefined();
    await expect(
      requestPasswordReset({ orgCode: 'NO-SUCH-ORG', email: ADMIN_EMAIL, client: 'portal' }, {}),
    ).resolves.toBeUndefined();
    const after = await runWithTenant(tenantId, (tx) => tx.select().from(passwordResetTokens));
    expect(after.length).toBe(before.length);
  });

  test('a valid link sets the new password once, then dies: sessions revoked, reuse refused', async ({
    skip,
  }) => {
    if (!ready) return skip();
    // A live session that the reset must kill.
    await login({ orgCode: CODE, email: ADMIN_EMAIL, password: tempPassword }, {});

    const token = await mintResetToken(adminUserId);
    // Deliberately unrelated to the account holder's own name and organization code: the
    // reset path enforces the platform password policy (ADR-082), which refuses a password
    // built out of what an attacker already knows. See the test below.
    const NEW_PASSWORD = 'Gulmohar-Terrace-88';
    await resetPassword({ token, newPassword: NEW_PASSWORD }, {});

    // Old password refused, new one works.
    await expect(
      login({ orgCode: CODE, email: ADMIN_EMAIL, password: tempPassword }, {}),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
    const result = await login({ orgCode: CODE, email: ADMIN_EMAIL, password: NEW_PASSWORD }, {});
    expect(result.status).toBe('ok');

    // Every session that existed before the reset is revoked (the fresh login above is new).
    const revoked = await runWithTenant(tenantId, (tx) =>
      tx.select().from(sessions).where(eq(sessions.userId, adminUserId)),
    );
    expect(revoked.filter((s) => s.revokedAt !== null).length).toBeGreaterThan(0);

    // Single-use: the same link again is refused with the uniform message.
    await expect(
      resetPassword({ token, newPassword: 'AnotherPass#2026' }, {}),
    ).rejects.toMatchObject({
      statusCode: 401,
    });

    // Every other outstanding link died with the successful reset.
    const rows = await runWithTenant(tenantId, (tx) =>
      tx.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, adminUserId)),
    );
    expect(rows.every((r) => r.consumedAt !== null)).toBe(true);
  });

  test('an expired row is refused even when the JWT itself is still valid', async ({ skip }) => {
    if (!ready) return skip();
    const token = await mintResetToken(adminUserId, new Date(Date.now() - 60_000));
    await expect(
      resetPassword({ token, newPassword: 'ExpiredPass#2026' }, {}),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  test('garbage and non-reset tokens are refused with the uniform message', async ({ skip }) => {
    if (!ready) return skip();
    await expect(
      resetPassword({ token: 'not-a-real-token-at-all', newPassword: 'GarbagePass#2026' }, {}),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  test('the reset path enforces the password policy, including the account holder’s own details', async ({
    skip,
  }) => {
    if (!ready) return skip();
    // A reset link is exactly where a weak password would otherwise slip in: the user is
    // locked out, in a hurry, and nobody is looking (ADR-082, SECURITY-AUDIT.md M-6).
    const weak = await mintResetToken(adminUserId);
    await expect(
      resetPassword({ token: weak, newPassword: 'password1234' }, {}),
    ).rejects.toMatchObject({
      statusCode: 422,
    });

    const personal = await mintResetToken(adminUserId);
    await expect(
      resetPassword({ token: personal, newPassword: 'A2-Reset-Admin-99' }, {}),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});
