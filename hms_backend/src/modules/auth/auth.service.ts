import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { runWithTenant } from '../../db/tenantContext';
import { tenants, users, sessions, type User } from '../../db/schema';
import { Errors } from '../../http/error';
import { verifyPassword } from './password';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  tokenExpiry,
  type RefreshClaims,
} from './tokens';
import type { LoginInput, PublicUser } from './auth.schema';

type ClientMeta = { userAgent?: string; ip?: string };

export type LoginResult =
  | { status: 'mfa_required'; userId: string }
  | { status: 'ok'; accessToken: string; refreshToken: string; user: PublicUser };

function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    tenantId: u.tenantId,
    email: u.email,
    fullName: u.fullName,
    mfaEnabled: u.mfaEnabled,
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

async function issueSession(tenantId: string, userId: string, meta: ClientMeta) {
  const sid = randomUUID();
  const refreshToken = signRefreshToken({ sub: userId, tid: tenantId, sid });
  const accessToken = signAccessToken({ sub: userId, tid: tenantId, roles: [] });
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
  if (!user || user.status !== 'active') throw Errors.unauthorized('Invalid credentials');

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) throw Errors.unauthorized('Invalid credentials');

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

    const accessToken = signAccessToken({ sub: claims.sub, tid: claims.tid, roles: [] });
    return { accessToken, refreshToken: newRefresh };
  });
}

// Revokes the session behind a refresh token. Best-effort — an already-invalid token is a no-op.
export async function logout(refreshTokenRaw: string | undefined): Promise<void> {
  if (!refreshTokenRaw) return;
  let claims: RefreshClaims;
  try {
    claims = verifyRefreshToken(refreshTokenRaw);
  } catch {
    return;
  }
  await runWithTenant(claims.tid, (tx) =>
    tx
      .update(sessions)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(sessions.id, claims.sid)),
  );
}

export async function getUserById(tenantId: string, userId: string): Promise<PublicUser | null> {
  const user = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    return rows[0] ?? null;
  });
  return user ? toPublicUser(user) : null;
}
