import type { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { permissionLabel, permissionModuleKey, WILDCARD } from '@hms/permissions';
import { runWithTenant } from '../../db/tenantContext';
import { rolePermissions, roles } from '../../db/schema';
import { isModuleEntitled } from '../entitlement/entitlement.service';
import { moduleDef } from '../entitlement/moduleCatalog';
import { resolvePermissions } from './rbac.service';

export async function getMyPermissions(req: Request, res: Response): Promise<void> {
  const { tenantId, userId } = req.auth!;
  const resolved = await resolvePermissions(tenantId, userId);
  res.json({
    wildcard: resolved.wildcard,
    permissions: Array.from(resolved.permissions).sort(),
  });
}

/**
 * Explain a refusal to the person who hit it (ADR-126).
 *
 * Answers three questions a bare 403 cannot: what permission is required (in words, and as a
 * key), whether the hospital even has the module — because that is a different problem with a
 * different owner — and which of THIS hospital's roles hold it, custom roles included, so the
 * user knows what to ask for.
 *
 * Authenticated, and nothing more. It describes the caller's own hospital: which roles exist and
 * what they may do is what an employee is told on their first day, and withholding it only makes
 * the refusal useless. It reveals no patient data, no other tenant and no account.
 */
export async function explainAccess(req: Request, res: Response): Promise<void> {
  const { tenantId, userId } = req.auth!;
  const permission = String(req.query.permission ?? '');

  const resolved = await resolvePermissions(tenantId, userId);
  const granted = resolved.wildcard || resolved.permissions.has(permission);

  const moduleKey = permissionModuleKey(permission);
  const enabled = moduleKey ? await isModuleEntitled(tenantId, moduleKey) : true;

  // Roles are read from the tenant's own role_permissions, not from SYSTEM_ROLES: a hospital
  // that cloned a role, or had a key removed from one, must see its own answer rather than the
  // shipped default. A role holding the wildcard grants everything, so it counts too.
  const holders = await runWithTenant(tenantId, (tx) =>
    tx
      .select({ key: roles.key, name: roles.name, isSystem: roles.isSystem, permissionKey: rolePermissions.permissionKey })
      .from(roles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .where(and(eq(roles.tenantId, tenantId))),
  );
  const seen = new Set<string>();
  const grantedByRoles = holders
    .filter((r) => r.permissionKey === permission || r.permissionKey === WILDCARD)
    .filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true)))
    .map((r) => ({ key: r.key, name: r.name, isSystem: r.isSystem }));

  // Module FIRST, exactly as the server enforces it (requireModule before requirePermission).
  // A user can hold a permission for a module their hospital does not have — the administrator
  // now holds nearly all of them (ADR-125) — and telling that person their role is short a
  // permission would send them to ask for something that would change nothing.
  res.json({
    permission: { key: permission, label: permissionLabel(permission) },
    module: moduleKey ? { key: moduleKey, name: moduleDef(moduleKey)?.name ?? moduleKey, enabled } : null,
    granted: granted && enabled,
    reason: !enabled ? 'module_not_enabled' : granted ? 'granted' : 'permission_missing',
    grantedByRoles,
  });
}

export async function listRoles(req: Request, res: Response): Promise<void> {
  const { tenantId } = req.auth!;
  const rows = await runWithTenant(tenantId, (tx) =>
    tx.select().from(roles).where(eq(roles.tenantId, tenantId)),
  );
  res.json({
    roles: rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
    })),
  });
}
