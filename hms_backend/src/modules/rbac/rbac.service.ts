import { and, eq, inArray } from 'drizzle-orm';
import { SYSTEM_ROLES, ALL_PERMISSIONS, WILDCARD, permissionModule } from '@hms/permissions';
import { db } from '../../db/client';
import { runWithTenant } from '../../db/tenantContext';
import {
  permissions as permissionsTable,
  roles,
  rolePermissions,
  tenants,
  userRoles,
  userPermissionOverrides,
} from '../../db/schema';
import * as cache from './permissionCache';
import { writeAudit } from '../audit/audit.service';

export type ResolvedPermissions = { permissions: Set<string>; wildcard: boolean };

// Seeds the global permission catalog (idempotent). `permissions` has no RLS, so it uses the
// base connection.
export async function seedPermissionCatalog(): Promise<void> {
  for (const key of ALL_PERMISSIONS) {
    await db
      .insert(permissionsTable)
      .values({ key, module: permissionModule(key), description: null })
      .onConflictDoNothing();
  }
}

// Provisions the system roles + their permissions for a tenant (idempotent). Runs inside the
// tenant context so RLS WITH CHECK is satisfied. Call this when a tenant is created.
export async function provisionTenantRbac(tenantId: string): Promise<void> {
  await runWithTenant(tenantId, async (tx) => {
    for (const def of SYSTEM_ROLES) {
      const existing = (
        await tx
          .select()
          .from(roles)
          .where(and(eq(roles.tenantId, tenantId), eq(roles.key, def.key)))
          .limit(1)
      )[0];
      const roleId =
        existing?.id ??
        (
          await tx
            .insert(roles)
            .values({
              tenantId,
              key: def.key,
              name: def.name,
              description: def.description,
              isSystem: true,
            })
            .returning()
        )[0]!.id;

      for (const perm of def.permissions) {
        await tx
          .insert(rolePermissions)
          .values({ tenantId, roleId, permissionKey: perm })
          .onConflictDoNothing();
      }
    }
  });
  cache.invalidateTenant(tenantId);
}

/**
 * Brings every existing tenant's system roles up to date with `@hms/permissions`.
 *
 * `provisionTenantRbac` runs once, at onboarding. Without this, a permission key added
 * later would exist in the catalog and be enforced by the routes, but no existing
 * hospital's org_admin would hold it — the feature would 403 for every current customer
 * and work only for hospitals onboarded afterwards.
 *
 * Additive only: it inserts missing roles and missing role→permission rows and never
 * removes one, so a tenant's own customisation is not undone by a deploy. Idempotent, and
 * run as part of `db:migrate`.
 */
export async function reconcileSystemRoles(): Promise<{ tenants: number }> {
  await seedPermissionCatalog();
  const rows = await db.select({ id: tenants.id }).from(tenants);
  for (const t of rows) {
    await provisionTenantRbac(t.id);
  }
  return { tenants: rows.length };
}

export async function assignRoleByKey(
  tenantId: string,
  userId: string,
  roleKey: string,
): Promise<void> {
  await runWithTenant(tenantId, async (tx) => {
    const role = (
      await tx
        .select()
        .from(roles)
        .where(and(eq(roles.tenantId, tenantId), eq(roles.key, roleKey)))
        .limit(1)
    )[0];
    if (!role) throw new Error(`Role not found: ${roleKey}`);
    await tx
      .insert(userRoles)
      .values({ tenantId, userId, roleId: role.id })
      .onConflictDoNothing();
  });
  cache.invalidateUser(tenantId, userId);
  await writeAudit({
    tenantId,
    action: 'rbac.role.assign',
    resourceType: 'user',
    resourceId: userId,
    metadata: { roleKey },
  });
}

// Removes a role from a user (org-admin management). Idempotent. Invalidates the cache + audits.
export async function removeRoleByKey(
  tenantId: string,
  userId: string,
  roleKey: string,
): Promise<void> {
  await runWithTenant(tenantId, async (tx) => {
    const role = (
      await tx
        .select()
        .from(roles)
        .where(and(eq(roles.tenantId, tenantId), eq(roles.key, roleKey)))
        .limit(1)
    )[0];
    if (!role) return;
    await tx
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, role.id)));
  });
  cache.invalidateUser(tenantId, userId);
  await writeAudit({
    tenantId,
    action: 'rbac.role.remove',
    resourceType: 'user',
    resourceId: userId,
    metadata: { roleKey },
  });
}

// The roles currently assigned to a user (for the admin UI).
export async function listUserRoles(
  tenantId: string,
  userId: string,
): Promise<Array<{ key: string; name: string }>> {
  return runWithTenant(tenantId, (tx) =>
    tx
      .select({ key: roles.key, name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(userRoles.tenantId, tenantId), eq(userRoles.userId, userId))),
  );
}

// A user's active (non-revoked) permission overrides, for the admin UI.
export async function listUserOverrides(
  tenantId: string,
  userId: string,
): Promise<Array<{ id: string; permission: string; effect: string; validUntil: string | null }>> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx.select().from(userPermissionOverrides).where(eq(userPermissionOverrides.userId, userId)),
  );
  return rows
    .filter((o) => !o.revokedAt)
    .map((o) => ({
      id: o.id,
      permission: o.permission,
      effect: o.effect,
      validUntil: o.validUntil ? o.validUntil.toISOString() : null,
    }));
}

// Effective permissions = union(role permissions) + GRANT overrides − DENY overrides. DENY always
// wins. Temporary overrides are honoured by their validity window. Result is cached, bounded by
// the earliest relevant valid_until (ADR-010).
export async function resolvePermissions(
  tenantId: string,
  userId: string,
): Promise<ResolvedPermissions> {
  const cached = cache.getCached(tenantId, userId);
  if (cached) return { permissions: cached.permissions, wildcard: cached.wildcard };

  const resolved = await runWithTenant(tenantId, async (tx) => {
    const assigned = await tx
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    const roleIds = assigned.map((r) => r.roleId);

    const rolePerms = roleIds.length
      ? await tx
          .select({ key: rolePermissions.permissionKey })
          .from(rolePermissions)
          .where(inArray(rolePermissions.roleId, roleIds))
      : [];
    const effective = new Set<string>(rolePerms.map((r) => r.key));

    const overrides = await tx
      .select()
      .from(userPermissionOverrides)
      .where(eq(userPermissionOverrides.userId, userId));

    const now = Date.now();
    let earliestValidUntil: number | null = null;
    const grants: string[] = [];
    const denies: string[] = [];
    for (const o of overrides) {
      if (o.revokedAt) continue;
      if (o.validFrom && o.validFrom.getTime() > now) continue; // not yet active
      if (o.validUntil) {
        if (o.validUntil.getTime() <= now) continue; // expired
        earliestValidUntil =
          earliestValidUntil === null
            ? o.validUntil.getTime()
            : Math.min(earliestValidUntil, o.validUntil.getTime());
      }
      if (o.effect === 'GRANT') grants.push(o.permission);
      else if (o.effect === 'DENY') denies.push(o.permission);
    }
    for (const g of grants) effective.add(g);
    for (const d of denies) effective.delete(d); // DENY wins

    const wildcard = effective.has(WILDCARD);
    return { effective, wildcard, earliestValidUntil };
  });

  cache.setCached(tenantId, userId, resolved.effective, resolved.wildcard, resolved.earliestValidUntil);
  return { permissions: resolved.effective, wildcard: resolved.wildcard };
}

export function hasPermission(resolved: ResolvedPermissions, permission: string): boolean {
  return resolved.wildcard || resolved.permissions.has(permission);
}

// Adds a user override (grant/deny, optionally time-bound) and immediately invalidates the cache.
export async function setOverride(
  tenantId: string,
  params: {
    userId: string;
    permission: string;
    effect: 'GRANT' | 'DENY';
    validFrom?: Date | null;
    validUntil?: Date | null;
    reason?: string;
    createdBy?: string;
  },
): Promise<void> {
  await runWithTenant(tenantId, (tx) =>
    tx.insert(userPermissionOverrides).values({
      tenantId,
      userId: params.userId,
      permission: params.permission,
      effect: params.effect,
      validFrom: params.validFrom ?? null,
      validUntil: params.validUntil ?? null,
      reason: params.reason ?? null,
      createdBy: params.createdBy ?? null,
    }),
  );
  cache.invalidateUser(tenantId, params.userId);
  await writeAudit({
    tenantId,
    actorUserId: params.createdBy ?? null,
    action: `rbac.override.${params.effect.toLowerCase()}`,
    resourceType: 'user',
    resourceId: params.userId,
    metadata: {
      permission: params.permission,
      validUntil: params.validUntil ?? null,
      reason: params.reason ?? null,
    },
  });
}

// Revokes an override (never deletes) and immediately invalidates the cache (ADR-010).
export async function revokeOverride(
  tenantId: string,
  overrideId: string,
  userId: string,
): Promise<void> {
  await runWithTenant(tenantId, (tx) =>
    tx
      .update(userPermissionOverrides)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(userPermissionOverrides.id, overrideId)),
  );
  cache.invalidateUser(tenantId, userId); // ADR-010: revoked → immediate targeted invalidation
  await writeAudit({
    tenantId,
    action: 'rbac.override.revoke',
    resourceType: 'override',
    resourceId: overrideId,
    metadata: { userId },
  });
}
