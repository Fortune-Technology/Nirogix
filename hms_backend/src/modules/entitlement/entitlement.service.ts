import { and, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
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

/**
 * The effectiveness window, evaluated **by the database**.
 *
 * Evaluation always combines status + effective dates, never status alone (architecture.md) — but
 * *whose* clock decides is the part that mattered.
 *
 * `effective_from` defaults to Postgres's `now()`. The original check compared it against the Node
 * process's `Date.now()`, and those are two different clocks: on the same machine they still differ
 * by a millisecond or two, and Postgres's timestamp routinely lands *ahead*. A module granted and
 * then immediately checked — which is exactly what `onboardTenant` does, granting `patient` and
 * then asking whether `patient` is entitled before granting `appointment` — could therefore read as
 * "not yet effective" and fail onboarding outright:
 *
 *     effective_from  2026-08-31T13:48:20.863Z   (Postgres)
 *     Date.now()      2026-08-31T13:48:20.862Z   (Node)      -> 1ms in the future -> not effective
 *
 * It surfaced as an intermittent test failure and was diagnosed as a concurrency race for a week.
 * It was never concurrency. It is a **real onboarding bug** that would fail a live tenant whenever
 * the two clocks landed the wrong way round, and grow more likely on faster hardware.
 *
 * So the comparison moved into SQL, where the same clock that wrote the row reads it. This predicate
 * is the single definition of "entitled right now"; keep it here rather than restating it per query.
 */
const effectiveNow = () =>
  and(
    inArray(tenantEntitlements.status, [...ACTIVE_STATUSES]),
    or(isNull(tenantEntitlements.effectiveFrom), lte(tenantEntitlements.effectiveFrom, sql`now()`)),
    or(isNull(tenantEntitlements.effectiveUntil), gt(tenantEntitlements.effectiveUntil, sql`now()`)),
  );

/**
 * The same rule for a row already in hand.
 *
 * Kept for callers holding a `TenantEntitlement` rather than issuing a query, and deliberately
 * given a small tolerance: it compares against two clocks and cannot do otherwise, so treating a
 * start time a few milliseconds in the future as "started" is the honest reading of a row whose
 * timestamp was written by a different machine's `now()`. Prefer `effectiveNow()` in a query.
 */
const CLOCK_SKEW_TOLERANCE_MS = 5_000;

function isEffective(row: TenantEntitlement): boolean {
  if (!ACTIVE_STATUSES.has(row.status)) return false;
  const now = Date.now();
  if (row.effectiveFrom && row.effectiveFrom.getTime() - CLOCK_SKEW_TOLERANCE_MS > now) return false;
  if (row.effectiveUntil && row.effectiveUntil.getTime() <= now) return false;
  return true;
}

// Currently-entitled org-wide module keys for a tenant.
export async function listEntitledModules(tenantId: string): Promise<Set<string>> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .select({ module: tenantEntitlements.module })
      .from(tenantEntitlements)
      .where(
        and(
          eq(tenantEntitlements.tenantId, tenantId),
          isNull(tenantEntitlements.branchId),
          effectiveNow(),
        ),
      ),
  );
  return new Set(rows.map((r) => r.module));
}

export async function isModuleEntitled(tenantId: string, moduleKey: string): Promise<boolean> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .select({ module: tenantEntitlements.module })
      .from(tenantEntitlements)
      .where(
        and(
          eq(tenantEntitlements.tenantId, tenantId),
          eq(tenantEntitlements.module, moduleKey),
          isNull(tenantEntitlements.branchId),
          effectiveNow(),
        ),
      )
      .limit(1),
  );
  return rows.length > 0;
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
