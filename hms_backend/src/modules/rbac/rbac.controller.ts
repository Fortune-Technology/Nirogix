import type { Request, Response } from 'express';
import { runWithTenant } from '../../db/tenantContext';
import { roles } from '../../db/schema';
import { resolvePermissions } from './rbac.service';

export async function getMyPermissions(req: Request, res: Response): Promise<void> {
  const { tenantId, userId } = req.auth!;
  const resolved = await resolvePermissions(tenantId, userId);
  res.json({
    wildcard: resolved.wildcard,
    permissions: Array.from(resolved.permissions).sort(),
  });
}

export async function listRoles(req: Request, res: Response): Promise<void> {
  const { tenantId } = req.auth!;
  const rows = await runWithTenant(tenantId, (tx) => tx.select().from(roles));
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
