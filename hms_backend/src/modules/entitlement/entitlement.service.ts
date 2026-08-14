import { and, eq, isNull } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { tenantEntitlements, type TenantEntitlement } from '../../db/schema';
import { MODULE_CATALOG, moduleDef } from './moduleCatalog';
import { writeAudit } from '../audit/audit.service';

const ACTIVE_STATUSES = new Set(['ACTIVE', 'TRIAL']);

export type ModuleStatus =
  | 'TRIAL'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'DEACTIVATED';

// Evaluation ALWAYS combines status + effective dates, never status alone (architecture.md).
function isEffective(row: TenantEntitlement): boolean {
  if (!ACTIVE_STATUSES.has(row.status)) return false;
  const now = Date.now();
  if (row.effectiveFrom && row.effectiveFrom.getTime() > now) return false;
  if (row.effectiveUntil && row.effectiveUntil.getTime() <= now) return false;
  return true;
}

// Currently-entitled org-wide module keys for a tenant.
export async function listEntitledModules(tenantId: string): Promise<Set<string>> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .select()
      .from(tenantEntitlements)
      .where(and(eq(tenantEntitlements.tenantId, tenantId), isNull(tenantEntitlements.branchId))),
  );
  const entitled = new Set<string>();
  for (const r of rows) if (isEffective(r)) entitled.add(r.module);
  return entitled;
}

export async function isModuleEntitled(tenantId: string, moduleKey: string): Promise<boolean> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .select()
      .from(tenantEntitlements)
      .where(
        and(
          eq(tenantEntitlements.tenantId, tenantId),
          eq(tenantEntitlements.module, moduleKey),
          isNull(tenantEntitlements.branchId),
        ),
      ),
  );
  return rows.some(isEffective);
}

// Grants (or reactivates) a module for a tenant. Enforces hard dependencies at grant time:
// refuses to activate a module whose hard dependency is not already entitled. Provisioning is
// operator-driven (manual); enforcement is automatic. Idempotent per (tenant, module, org-wide).
export async function grantModule(
  tenantId: string,
  moduleKey: string,
  opts: {
    status?: ModuleStatus;
    effectiveUntil?: Date | null;
    grantedBy?: string;
    reason?: string;
  } = {},
): Promise<void> {
  const def = moduleDef(moduleKey);
  if (!def) throw new Error(`Unknown module: ${moduleKey}`);
  const status: ModuleStatus = opts.status ?? 'ACTIVE';

  if (ACTIVE_STATUSES.has(status)) {
    for (const dep of def.hardDependencies) {
      if (!(await isModuleEntitled(tenantId, dep))) {
        throw new Error(
          `Cannot activate "${moduleKey}": hard dependency "${dep}" is not entitled`,
        );
      }
    }
  }

  await runWithTenant(tenantId, async (tx) => {
    const existing = (
      await tx
        .select()
        .from(tenantEntitlements)
        .where(
          and(
            eq(tenantEntitlements.tenantId, tenantId),
            eq(tenantEntitlements.module, moduleKey),
            isNull(tenantEntitlements.branchId),
          ),
        )
        .limit(1)
    )[0];

    if (existing) {
      await tx
        .update(tenantEntitlements)
        .set({
          status,
          // A fresh grant/reactivation is permanent unless an expiry is explicitly given —
          // never preserve a stale past expiry.
          effectiveUntil: opts.effectiveUntil ?? null,
          reason: opts.reason ?? existing.reason,
          updatedBy: opts.grantedBy ?? null,
          updatedAt: new Date(),
          suspendedAt: null,
          cancelledAt: null,
          deactivatedAt: null,
        })
        .where(eq(tenantEntitlements.id, existing.id));
    } else {
      await tx.insert(tenantEntitlements).values({
        tenantId,
        module: moduleKey,
        status,
        effectiveUntil: opts.effectiveUntil ?? null,
        reason: opts.reason ?? null,
        createdBy: opts.grantedBy ?? null,
      });
    }
  });

  await writeAudit({
    tenantId,
    actorUserId: opts.grantedBy ?? null,
    action: 'entitlement.grant',
    resourceType: 'module',
    resourceId: moduleKey,
    metadata: { status },
  });
}

// Transitions a module entitlement to a non-active state (soft — data is retained).
export async function setModuleStatus(
  tenantId: string,
  moduleKey: string,
  status: Extract<ModuleStatus, 'SUSPENDED' | 'CANCELLED' | 'DEACTIVATED' | 'EXPIRED'>,
  reason?: string,
): Promise<void> {
  const now = new Date();
  const stamp =
    status === 'SUSPENDED'
      ? { suspendedAt: now }
      : status === 'CANCELLED'
        ? { cancelledAt: now }
        : status === 'DEACTIVATED'
          ? { deactivatedAt: now }
          : {};
  await runWithTenant(tenantId, (tx) =>
    tx
      .update(tenantEntitlements)
      .set({ status, reason: reason ?? null, updatedAt: now, ...stamp })
      .where(
        and(
          eq(tenantEntitlements.tenantId, tenantId),
          eq(tenantEntitlements.module, moduleKey),
          isNull(tenantEntitlements.branchId),
        ),
      ),
  );
  await writeAudit({
    tenantId,
    action: 'entitlement.status',
    resourceType: 'module',
    resourceId: moduleKey,
    metadata: { status, reason: reason ?? null },
  });
}

export { MODULE_CATALOG };
