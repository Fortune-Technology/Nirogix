import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { runWithTenant } from '../../db/tenantContext';
import { users, userRoles, roles, tenants, type User } from '../../db/schema';
import { Errors } from '../../http/error';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { hashPassword } from '../auth/password';
import { assertAcceptablePassword, generateTempPassword } from '../auth/passwordPolicy';
import { issuePasswordSetupLink } from '../auth/auth.service';
import { sendAppEmail } from '../notification/communication.service';
import {
  assignRoleByKey,
  resolvePermissions,
  listUserRoles,
  listUserOverrides,
} from '../rbac/rbac.service';
import { writeAudit } from '../audit/audit.service';

/** "front_desk" → "Front Desk" — a readable role name for the welcome email. */
function roleDisplay(key?: string): string {
  if (!key) return 'a staff member';
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export type UserListItem = {
  id: string;
  email: string;
  fullName: string;
  status: string;
  mfaEnabled: boolean;
  roles: string[];
};

// All users in the tenant, each with their assigned role keys (one grouped query).
export async function listUsers(tenantId: string): Promise<UserListItem[]> {
  return runWithTenant(tenantId, async (tx) => {
    const us = await tx.select().from(users).where(eq(users.tenantId, tenantId));
    const assigns = await tx
      .select({ userId: userRoles.userId, key: roles.key })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.tenantId, tenantId));
    const byUser = new Map<string, string[]>();
    for (const a of assigns) {
      const arr = byUser.get(a.userId);
      if (arr) arr.push(a.key);
      else byUser.set(a.userId, [a.key]);
    }
    return us.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      status: u.status,
      mfaEnabled: u.mfaEnabled,
      roles: byUser.get(u.id) ?? [],
    }));
  });
}

// Creates a staff user (org-admin). Email unique within the tenant. When no password is supplied,
// a one-time temp password is generated and returned once (operator hands it over).
export async function createUser(
  tenantId: string,
  input: { email: string; fullName: string; roleKey?: string; password?: string },
  actorUserId?: string,
): Promise<{ userId: string; tempPassword: string | null }> {
  const plain = input.password ?? generateTempPassword();
  // The schema already enforced the context-free half; this adds the half that needs the
  // person: their own email and name must not be what their password is made of (ADR-082).
  if (input.password) {
    assertAcceptablePassword(input.password, { email: input.email, fullName: input.fullName });
  }
  const passwordHash = await hashPassword(plain);
  const userId = await runWithTenant(tenantId, async (tx) => {
    const existing = (
      await tx
        .select()
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.email, input.email)))
        .limit(1)
    )[0];
    if (existing) throw Errors.conflict(`A user with email "${input.email}" already exists`);
    const row = (
      await tx
        .insert(users)
        .values({
          tenantId,
          email: input.email,
          passwordHash,
          fullName: input.fullName,
          status: 'active',
        })
        .returning()
    )[0]!;
    return row.id;
  });
  if (input.roleKey) await assignRoleByKey(tenantId, userId, input.roleKey);
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'user.create',
    resourceType: 'user',
    resourceId: userId,
    metadata: { email: input.email, roleKey: input.roleKey ?? null },
  });

  // Welcome the new staff user with a "set your password" link (they sign in to the Portal).
  // Best-effort: a mail problem must never fail user creation.
  try {
    const orgName =
      (
        await db
          .select({ name: tenants.name })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1)
      )[0]?.name ?? 'Nirogix';
    const setupUrl = await issuePasswordSetupLink(tenantId, userId, 'portal');
    await sendAppEmail({
      tenantId,
      to: input.email,
      template: 'staff_welcome',
      data: {
        userName: input.fullName,
        orgName,
        roleName: roleDisplay(input.roleKey),
        setupUrl,
        loginUrl: `${env.PORTAL_URL.replace(/\/$/, '')}/login`,
      },
      idempotencyKey: `welcome-staff:${userId}`,
    });
  } catch (err) {
    logger.error({ err, tenantId, userId }, 'staff welcome email failed');
  }

  return { userId, tempPassword: input.password ? null : plain };
}

export type UserDetail = {
  user: User;
  roles: Array<{ key: string; name: string }>;
  wildcard: boolean;
  permissions: string[];
  overrides: Array<{ id: string; permission: string; effect: string; validUntil: string | null }>;
};

export async function getUserDetail(tenantId: string, id: string): Promise<UserDetail | null> {
  const user = (
    await runWithTenant(tenantId, (tx) =>
      tx
        .select()
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.id, id)))
        .limit(1),
    )
  )[0];
  if (!user) return null;
  const [rolesList, resolved, overrides] = await Promise.all([
    listUserRoles(tenantId, id),
    resolvePermissions(tenantId, id),
    listUserOverrides(tenantId, id),
  ]);
  return {
    user,
    roles: rolesList,
    wildcard: resolved.wildcard,
    permissions: Array.from(resolved.permissions).sort(),
    overrides,
  };
}

export async function updateUser(
  tenantId: string,
  id: string,
  patch: { status?: string; fullName?: string },
  actorUserId?: string,
): Promise<User> {
  const updated = (
    await runWithTenant(tenantId, (tx) =>
      tx
        .update(users)
        .set({
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.fullName ? { fullName: patch.fullName } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(users.tenantId, tenantId), eq(users.id, id)))
        .returning(),
    )
  )[0];
  if (!updated) throw Errors.notFound('User not found');
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'user.update',
    resourceType: 'user',
    resourceId: id,
    metadata: patch,
  });
  return updated;
}
