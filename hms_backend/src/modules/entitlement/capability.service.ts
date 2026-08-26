import { and, eq, isNull } from 'drizzle-orm';
import {
  MODULE_CATEGORIES,
  MODULE_REGISTRY,
  capabilityDef,
  capabilityDependents,
  moduleCapabilities,
  registryModule,
  type LifecycleStatus,
} from '@hms/permissions';
import { runWithTenant } from '../../db/tenantContext';
import {
  tenantCapabilityEntitlements,
  type TenantCapabilityEntitlement,
} from '../../db/schema';
import { writeAudit } from '../audit/audit.service';
import { isModuleEntitled, listEntitledModules } from './entitlement.service';

// The capability tier beneath module entitlements (ADR-085). Semantics are DENY-BY-EXCEPTION:
// a capability is ENABLED whenever its module is entitled AND no effective override disables it.
// A row in tenant_capability_entitlements is an EXCEPTION to the module default (turn a capability
// off, or scope/time-bound it) — so no row means "on", which is why introducing the table changed
// no behaviour and needed no backfill. The enforced chain gains one link:
//   requireAuth → requireModule → requireCapability → requirePermission → business logic.

const CAP_ACTIVE_STATUSES = new Set(['ACTIVE', 'TRIAL']);

export type CapabilityStatus = 'ACTIVE' | 'DISABLED' | 'SUSPENDED' | 'DEACTIVATED';

// Evaluation ALWAYS combines status + effective dates, never status alone (matches
// entitlement.service.isEffective for tenant_entitlements).
export function isCapabilityRowEffective(
  row: Pick<TenantCapabilityEntitlement, 'status' | 'effectiveFrom' | 'effectiveUntil'>,
): boolean {
  if (!CAP_ACTIVE_STATUSES.has(row.status)) return false;
  const now = Date.now();
  if (row.effectiveFrom && row.effectiveFrom.getTime() > now) return false;
  if (row.effectiveUntil && row.effectiveUntil.getTime() <= now) return false;
  return true;
}

/**
 * Pure resolution of a single capability's enabled state. Deny-by-exception:
 * disabled if the module is not entitled; otherwise ON unless an override row exists and
 * that row is not effective (i.e. an explicit disable / suspension / expiry). Exported so the
 * rule can be unit-tested without a database.
 */
export function resolveCapabilityEnabled(
  moduleEntitled: boolean,
  overrideRow:
    | Pick<TenantCapabilityEntitlement, 'status' | 'effectiveFrom' | 'effectiveUntil'>
    | undefined,
): boolean {
  if (!moduleEntitled) return false;
  if (!overrideRow) return true; // default ON when the module is on
  return isCapabilityRowEffective(overrideRow);
}

// The org-wide override rows for a tenant (branch-scoped config is a later UI).
async function orgWideOverrideRows(tenantId: string): Promise<TenantCapabilityEntitlement[]> {
  return runWithTenant(tenantId, (tx) =>
    tx
      .select()
      .from(tenantCapabilityEntitlements)
      .where(
        and(
          eq(tenantCapabilityEntitlements.tenantId, tenantId),
          isNull(tenantCapabilityEntitlements.branchId),
        ),
      ),
  );
}

export async function isCapabilityEntitled(
  tenantId: string,
  moduleKey: string,
  capabilityKey: string,
): Promise<boolean> {
  if (!(await isModuleEntitled(tenantId, moduleKey))) return false;
  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .select()
      .from(tenantCapabilityEntitlements)
      .where(
        and(
          eq(tenantCapabilityEntitlements.tenantId, tenantId),
          eq(tenantCapabilityEntitlements.module, moduleKey),
          eq(tenantCapabilityEntitlements.capability, capabilityKey),
          isNull(tenantCapabilityEntitlements.branchId),
        ),
      ),
  );
  return resolveCapabilityEnabled(true, rows[0]);
}

/**
 * The currently-enabled capability keys for a tenant — every declared capability of every
 * entitled module, minus those an effective override disables. This is what the session /
 * entitlements surface ships to the client alongside the entitled module set.
 */
export async function listEntitledCapabilities(tenantId: string): Promise<string[]> {
  const [modules, rows] = await Promise.all([
    listEntitledModules(tenantId),
    orgWideOverrideRows(tenantId),
  ]);
  // A capability is disabled when an override row exists for it AND that row is not effective.
  const disabled = new Set<string>();
  for (const r of rows) {
    if (!isCapabilityRowEffective(r)) disabled.add(r.capability);
  }
  const enabled: string[] = [];
  for (const moduleKey of modules) {
    for (const cap of moduleCapabilities(moduleKey)) {
      if (!disabled.has(cap.key)) enabled.push(cap.key);
    }
  }
  return enabled.sort();
}

// Sets (upserts) a capability override for a tenant, org-wide, and audits it. Enforces the
// configuration rules of ADR-085 §17 both ways:
//   - enabling a capability requires its module entitled AND its dependency capabilities enabled;
//   - disabling a capability is refused while an enabled capability still depends on it.
export async function setCapabilityStatus(
  tenantId: string,
  moduleKey: string,
  capabilityKey: string,
  status: CapabilityStatus,
  opts: {
    effectiveUntil?: Date | null;
    changedBy?: string;
    reason?: string;
  } = {},
): Promise<void> {
  const def = capabilityDef(capabilityKey);
  if (!def || def.moduleKey !== moduleKey) {
    throw new Error(`Unknown capability "${capabilityKey}" for module "${moduleKey}"`);
  }

  const enabling = status === 'ACTIVE';
  if (enabling) {
    if (!(await isModuleEntitled(tenantId, moduleKey))) {
      throw new Error(
        `Cannot enable capability "${capabilityKey}": module "${moduleKey}" is not entitled`,
      );
    }
    for (const dep of def.dependencies ?? []) {
      const depDef = capabilityDef(dep);
      if (depDef && !(await isCapabilityEntitled(tenantId, depDef.moduleKey, dep))) {
        throw new Error(
          `Cannot enable capability "${capabilityKey}": dependency "${dep}" is not enabled`,
        );
      }
    }
  } else {
    // Refuse to disable a capability other enabled capabilities still depend on.
    const blockers: string[] = [];
    for (const dependent of capabilityDependents(capabilityKey)) {
      if (await isCapabilityEntitled(tenantId, dependent.moduleKey, dependent.key)) {
        blockers.push(dependent.key);
      }
    }
    if (blockers.length > 0) {
      throw new Error(
        `Cannot disable capability "${capabilityKey}": still required by ${blockers.join(', ')}`,
      );
    }
  }

  const now = new Date();
  await runWithTenant(tenantId, async (tx) => {
    const existing = (
      await tx
        .select()
        .from(tenantCapabilityEntitlements)
        .where(
          and(
            eq(tenantCapabilityEntitlements.tenantId, tenantId),
            eq(tenantCapabilityEntitlements.module, moduleKey),
            eq(tenantCapabilityEntitlements.capability, capabilityKey),
            isNull(tenantCapabilityEntitlements.branchId),
          ),
        )
        .limit(1)
    )[0];

    const disabledAt = enabling ? null : now;
    if (existing) {
      await tx
        .update(tenantCapabilityEntitlements)
        .set({
          status,
          effectiveUntil: opts.effectiveUntil ?? null,
          disabledAt,
          reason: opts.reason ?? existing.reason,
          updatedBy: opts.changedBy ?? null,
          updatedAt: now,
        })
        .where(eq(tenantCapabilityEntitlements.id, existing.id));
    } else {
      await tx.insert(tenantCapabilityEntitlements).values({
        tenantId,
        module: moduleKey,
        capability: capabilityKey,
        status,
        effectiveUntil: opts.effectiveUntil ?? null,
        disabledAt,
        reason: opts.reason ?? null,
        createdBy: opts.changedBy ?? null,
      });
    }
  });

  await writeAudit({
    tenantId,
    actorUserId: opts.changedBy ?? null,
    action: 'capability.status',
    resourceType: 'capability',
    resourceId: capabilityKey,
    metadata: { module: moduleKey, status, reason: opts.reason ?? null },
  });
}

export interface TenantCapabilityRow {
  module: string;
  moduleName: string;
  capability: string;
  name: string;
  status: LifecycleStatus;
  enabled: boolean;
  dependencies: string[];
}

// Every declared capability of the tenant's entitled modules, each with its current enabled state
// (deny-by-exception → enabled unless an effective override disables it). Drives the admin
// capability-configuration screen. Modules with no declared capabilities contribute nothing.
export async function listTenantCapabilities(tenantId: string): Promise<TenantCapabilityRow[]> {
  const [modules, rows] = await Promise.all([
    listEntitledModules(tenantId),
    orgWideOverrideRows(tenantId),
  ]);
  const disabled = new Set<string>();
  for (const r of rows) {
    if (!isCapabilityRowEffective(r)) disabled.add(r.capability);
  }
  const out: TenantCapabilityRow[] = [];
  for (const moduleKey of [...modules].sort()) {
    const m = registryModule(moduleKey);
    if (!m) continue;
    for (const cap of m.capabilities) {
      out.push({
        module: moduleKey,
        moduleName: m.name,
        capability: cap.key,
        name: cap.name,
        status: cap.status,
        enabled: !disabled.has(cap.key),
        dependencies: [...(cap.dependencies ?? [])],
      });
    }
  }
  return out;
}

export interface ModuleConfigCapability {
  key: string;
  name: string;
  status: LifecycleStatus;
  enabled: boolean;
  dependencies: string[];
}

export interface ModuleConfigModule {
  key: string;
  name: string;
  category: string;
  status: LifecycleStatus;
  /** Platform Core — always on, never togglable per tenant. */
  alwaysOn: boolean;
  hardDependencies: string[];
  entitled: boolean;
  capabilities: ModuleConfigCapability[];
}

export interface TenantModuleConfig {
  categories: Array<{ key: string; name: string }>;
  modules: ModuleConfigModule[];
}

// The whole module/capability picture for one tenant, from the single canonical registry
// (ADR-085 §19) — every module (entitled or not) grouped by domain, with each capability's
// enabled state resolved. This is what the three-level admin module manager renders, and the shape
// any surface should consume rather than re-deriving module visibility itself. A capability is
// enabled only when its module is entitled and no effective override disables it (deny-by-exception).
export async function getTenantModuleConfig(tenantId: string): Promise<TenantModuleConfig> {
  const [entitled, rows] = await Promise.all([
    listEntitledModules(tenantId),
    orgWideOverrideRows(tenantId),
  ]);
  const disabled = new Set<string>();
  for (const r of rows) {
    if (!isCapabilityRowEffective(r)) disabled.add(r.capability);
  }

  const modules: ModuleConfigModule[] = MODULE_REGISTRY.map((m) => {
    // Platform Core is always on — it is not sold or switched off per tenant, so it reports as
    // entitled regardless of whether an entitlement row happens to exist (ADR-085).
    const isEntitled = m.alwaysOn === true || entitled.has(m.key);
    return {
      key: m.key,
      name: m.name,
      category: m.category,
      status: m.status,
      alwaysOn: m.alwaysOn === true,
      hardDependencies: [...m.hardDependencies],
      entitled: isEntitled,
      capabilities: m.capabilities.map((cap) => ({
        key: cap.key,
        name: cap.name,
        status: cap.status,
        // A capability is only meaningfully enabled when its module is on.
        enabled: isEntitled && !disabled.has(cap.key),
        dependencies: [...(cap.dependencies ?? [])],
      })),
    };
  });

  // Only surface domains that actually have modules, in the canonical display order.
  const present = new Set(modules.map((m) => m.category));
  const categories = MODULE_CATEGORIES.filter((c) => present.has(c.key)).map((c) => ({
    key: c.key,
    name: c.name,
  }));

  return { categories, modules };
}
