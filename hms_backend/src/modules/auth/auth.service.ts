import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/client';
import { runWithTenant } from '../../db/tenantContext';
import { tenants, users, sessions, type User } from '../../db/schema';
import { Errors } from '../../http/error';
import { burnPasswordComparison, hashPassword, verifyPassword } from './password';
import { listUserRoles } from '../rbac/rbac.service';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  tokenExpiry,
  type RefreshClaims,
} from './tokens';
import type { LoginInput, PublicUser } from './auth.schema';
import { writeAudit } from '../audit/audit.service';
import { eventBus } from '../../events/eventBus';

type ClientMeta = { userAgent?: string; ip?: string };

export type LoginResult =
  | { status: 'mfa_required'; userId: string }
  | { status: 'ok'; accessToken: string; refreshToken: string; user: PublicUser };

export function toPublicUserRow(u: User): PublicUser {
  return toPublicUser(u);
}

function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    tenantId: u.tenantId,
    email: u.email,
    fullName: u.fullName,
    mfaEnabled: u.mfaEnabled,
    status: u.status,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}

// Tenant resolution at login by organization code (resources/architecture.md → Multi-Tenancy).
// `tenants` has no RLS, so this runs on the base connection before any tenant context exists.
async function resolveTenantByCode(code: string) {
  const rows = await db.select().from(tenants).where(eq(tenants.code, code)).limit(1);
  return rows[0] ?? null;
}

function requireRefreshClaims(token: string): RefreshClaims {
  try {
    return verifyRefreshToken(token);
  } catch {
    throw Errors.unauthorized('Invalid or expired session');
  }
}

/**
 * Role keys for the access token. Informational only: authorization is always
 * re-resolved server-side from roles + overrides (invariant #2), but the Portal
 * shows them on the profile, so an empty claim is a real defect rather than a
 * harmless one.
 */
async function roleKeysFor(tenantId: string, userId: string): Promise<string[]> {
  return (await listUserRoles(tenantId, userId)).map((r) => r.key);
}

async function issueSession(tenantId: string, userId: string, meta: ClientMeta) {
  const sid = randomUUID();
  const refreshToken = signRefreshToken({ sub: userId, tid: tenantId, sid });
  const accessToken = signAccessToken({
    sub: userId,
    tid: tenantId,
    roles: await roleKeysFor(tenantId, userId),
  });
  await runWithTenant(tenantId, (tx) =>
    tx.insert(sessions).values({
      id: sid,
      tenantId,
      userId,
      tokenHash: hashToken(refreshToken),
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      ip: meta.ip?.slice(0, 64) ?? null,
      expiresAt: tokenExpiry(refreshToken),
    }),
  );
  return { accessToken, refreshToken };
}

export async function login(input: LoginInput, meta: ClientMeta): Promise<LoginResult> {
  const tenant = await resolveTenantByCode(input.orgCode);
  // Generic failure — never reveal whether the org or email exists.
  if (!tenant || tenant.status !== 'active') throw Errors.unauthorized('Invalid credentials');

  const user = await runWithTenant(tenant.id, async (tx) => {
    const rows = await tx
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenant.id), eq(users.email, input.email)))
      .limit(1);
    return rows[0] ?? null;
  });
  if (!user || user.status !== 'active') {
    // Equalise timing with the "wrong password" path so response time cannot be
    // used to discover which emails exist (SECURITY-AUDIT.md M-5).
    await burnPasswordComparison(input.password);
    await writeAudit({
      tenantId: tenant.id,
      action: 'auth.login.failure',
      severity: 'warning',
      metadata: { email: input.email, reason: 'user_not_found_or_inactive' },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    throw Errors.unauthorized('Invalid credentials');
  }

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    await writeAudit({
      tenantId: tenant.id,
      actorUserId: user.id,
      action: 'auth.login.failure',
      severity: 'warning',
      metadata: { reason: 'bad_password' },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    throw Errors.unauthorized('Invalid credentials');
  }

  // MFA hook — present but not enforced at MVP. A tenant that enables MFA receives a challenge
  // state instead of tokens; the actual second-factor verification is a later phase.
  if (user.mfaEnabled) {
    return { status: 'mfa_required', userId: user.id };
  }

  const { accessToken, refreshToken } = await issueSession(tenant.id, user.id, meta);
  await runWithTenant(tenant.id, (tx) =>
    tx
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id)),
  );

  await writeAudit({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: 'auth.login.success',
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  eventBus.publish('user.logged_in', {
    tenantId: tenant.id,
    userId: user.id,
    at: new Date().toISOString(),
  });

  return { status: 'ok', accessToken, refreshToken, user: toPublicUser(user) };
}

// Verifies + rotates the refresh token, returning a fresh access + refresh pair.
export async function refresh(
  refreshTokenRaw: string,
  meta: ClientMeta,
): Promise<{ accessToken: string; refreshToken: string }> {
  const claims = requireRefreshClaims(refreshTokenRaw);

  return runWithTenant(claims.tid, async (tx) => {
    const rows = await tx.select().from(sessions).where(eq(sessions.id, claims.sid)).limit(1);
    const session = rows[0];
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() < Date.now() ||
      session.tokenHash !== hashToken(refreshTokenRaw)
    ) {
      throw Errors.unauthorized('Invalid or expired session');
    }

    // Refresh-token rotation: new refresh token, stored hash updated.
    const newRefresh = signRefreshToken({ sub: claims.sub, tid: claims.tid, sid: claims.sid });
    await tx
      .update(sessions)
      .set({
        tokenHash: hashToken(newRefresh),
        expiresAt: tokenExpiry(newRefresh),
        userAgent: meta.userAgent?.slice(0, 300) ?? session.userAgent,
        ip: meta.ip?.slice(0, 64) ?? session.ip,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, claims.sid));

    // Re-read roles on refresh so a role granted or removed mid-session is
    // reflected in the next token rather than persisting until sign-out.
    const accessToken = signAccessToken({
      sub: claims.sub,
      tid: claims.tid,
      roles: await roleKeysFor(claims.tid, claims.sub),
    });
    return { accessToken, refreshToken: newRefresh };
  });
}

// Revokes the session behind a refresh token. Best-effort — an already-invalid token is a no-op.
/**
 * Revokes the presented session and reports what it was, so the caller can audit
 * it. The support-session flag comes from the SESSION ROW rather than the access
 * token, because `/auth/logout` is deliberately unauthenticated — a client with an
 * expired access token must still be able to sign out.
 */
export async function logout(
  refreshTokenRaw: string | undefined,
): Promise<{ tenantId: string; userId: string; impersonatedBy: string | null } | null> {
  if (!refreshTokenRaw) return null;
  let claims: RefreshClaims;
  try {
    claims = verifyRefreshToken(refreshTokenRaw);
  } catch {
    return null;
  }
  return runWithTenant(claims.tid, async (tx) => {
    const revoked = await tx
      .update(sessions)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(sessions.id, claims.sid))
      .returning();
    const row = revoked[0];
    if (!row) return null;
    return { tenantId: row.tenantId, userId: row.userId, impersonatedBy: row.impersonatedBy ?? null };
  });
}

export async function getUserById(tenantId: string, userId: string): Promise<PublicUser | null> {
  const user = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    return rows[0] ?? null;
  });
  return user ? toPublicUser(user) : null;
}

// ---- Self-service profile (ADR-035) ----------------------------------------
// A user maintains their own account without needing an org_admin. Both operations
// are tenant-scoped through runWithTenant and act only on the caller's own row —
// the userId comes from the verified access token, never from the request body.

export async function updateOwnProfile(
  tenantId: string,
  userId: string,
  patch: { fullName: string },
): Promise<PublicUser> {
  const updated = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .update(users)
      .set({ fullName: patch.fullName.trim(), updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
      .returning();
    return rows[0] ?? null;
  });
  if (!updated) throw Errors.notFound('User not found');
  return toPublicUser(updated);
}

/**
 * Changes the caller's password. Requires the current password, so a stolen
 * access token alone cannot take over the account, and revokes every session for
 * the user — the client must sign in again afterwards.
 */
export async function changeOwnPassword(
  tenantId: string,
  userId: string,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
      .limit(1);
    const user = rows[0];
    if (!user) throw Errors.notFound('User not found');

    const ok = await verifyPassword(input.currentPassword, user.passwordHash);
    // Deliberately the same message either way: never reveal which half was wrong.
    if (!ok) throw Errors.validation(undefined, 'Current password is incorrect');
    if (await verifyPassword(input.newPassword, user.passwordHash)) {
      throw Errors.validation(undefined, 'The new password must be different from the current one');
    }

    await tx
      .update(users)
      .set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() })
      .where(eq(users.id, userId));

    // Every session is invalidated, including this one: a password change must log
    // out an attacker holding a stolen refresh token, and the user signs in again.
    await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  });
}

/**
 * Mints a session for `userId` on behalf of a platform operator (ADR-037). The
 * tokens carry the TARGET's roles — the operator's privileges never travel into
 * the tenant — plus `imp`, so every request and the UI can tell this is a support
 * session. Provenance is stored on the session row, so it survives refresh.
 */
export async function issueImpersonatedSession(
  tenantId: string,
  userId: string,
  roles: string[],
  meta: ClientMeta & { impersonatedBy: string; reason: string },
): Promise<{ accessToken: string; refreshToken: string }> {
  const sid = randomUUID();
  const refreshToken = signRefreshToken({ sub: userId, tid: tenantId, sid });
  const accessToken = signAccessToken({ sub: userId, tid: tenantId, roles, imp: meta.impersonatedBy });
  await runWithTenant(tenantId, (tx) =>
    tx.insert(sessions).values({
      id: sid,
      tenantId,
      userId,
      tokenHash: hashToken(refreshToken),
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      ip: meta.ip?.slice(0, 64) ?? null,
      impersonatedBy: meta.impersonatedBy,
      impersonationReason: meta.reason.slice(0, 300),
      expiresAt: tokenExpiry(refreshToken),
    }),
  );
  return { accessToken, refreshToken };
}
