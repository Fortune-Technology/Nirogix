import { randomBytes } from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { runWithTenant } from '../../db/tenantContext';
import { tenants, users, branches, providers, type Tenant } from '../../db/schema';
import { Errors } from '../../http/error';
import { hashPassword } from '../auth/password';
import { provisionTenantRbac, assignRoleByKey } from '../rbac/rbac.service';
import {
  grantModule,
  setModuleStatus,
  listEntitledModules,
} from '../entitlement/entitlement.service';
import { MODULE_CATALOG, moduleDef } from '../entitlement/moduleCatalog';
import { writeAudit } from '../audit/audit.service';

// The MVP module set a new clinic gets by default (development-plan §20A). Order-independent;
// dependency closure + hard-dependency ordering are handled below.
const DEFAULT_MODULES = ['patient', 'appointment', 'opd', 'emr', 'pharmacy', 'laboratory', 'billing'];

// A random, human-handoff temporary password (returned once). No login complexity rule is enforced;
// this is simply a strong default the org admin changes on first login.
function generateTempPassword(): string {
  return `Hms-${randomBytes(6).toString('base64url')}`;
}

// Expand a requested module set to include every hard dependency (transitive), then order by the
// catalog so grants never hit a missing-dependency error (you can't have `appointment` without
// `patient`, so onboarding grants `patient` too).
function resolveModuleOrder(requested: string[]): string[] {
  const needed = new Set<string>();
  const add = (key: string): void => {
    if (needed.has(key)) return;
    const def = moduleDef(key);
    if (!def) throw Errors.validation(undefined, `Unknown module: ${key}`);
    for (const dep of def.hardDependencies) add(dep);
    needed.add(key);
  };
  for (const k of requested) add(k);
  // Emit in catalog order (dependencies precede dependents in MODULE_CATALOG).
  return MODULE_CATALOG.filter((m) => needed.has(m.key)).map((m) => m.key);
}

export type OnboardInput = {
  code: string;
  name: string;
  modules?: string[];
  admin: { email: string; fullName: string };
  branches?: Array<{ code: string; name: string }>;
};

export type OnboardResult = {
  tenant: Tenant;
  admin: { email: string; tempPassword: string };
};

// Operator-driven onboarding (ADR-020): create tenant → provision RBAC → grant modules →
// create the first org_admin (temp password) → create initial branches. Cross-tenant: the tenant
// row is created on the platform-level (no-RLS) `tenants` table; everything else runs in the NEW
// tenant's context via runWithTenant, so RLS is satisfied and the data is isolated from birth.
export async function onboardTenant(input: OnboardInput, actorUserId?: string): Promise<OnboardResult> {
  const existing = (await db.select().from(tenants).where(eq(tenants.code, input.code)).limit(1))[0];
  if (existing) throw Errors.conflict(`A tenant with code "${input.code}" already exists`);

  const moduleOrder = resolveModuleOrder(input.modules ?? DEFAULT_MODULES);

  const tenant = (await db.insert(tenants).values({ code: input.code, name: input.name }).returning())[0]!;

  await provisionTenantRbac(tenant.id);

  for (const m of moduleOrder) {
    await grantModule(tenant.id, m, { grantedBy: actorUserId, reason: 'tenant onboarding' });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const adminUserId = await runWithTenant(tenant.id, async (tx) => {
    const row = (
      await tx
        .insert(users)
        .values({
          tenantId: tenant.id,
          email: input.admin.email,
          passwordHash,
          fullName: input.admin.fullName,
          status: 'active',
        })
        .returning()
    )[0]!;
    return row.id;
  });
  await assignRoleByKey(tenant.id, adminUserId, 'org_admin');

  if (input.branches?.length) {
    await runWithTenant(tenant.id, async (tx) => {
      for (const b of input.branches!) {
        await tx.insert(branches).values({ tenantId: tenant.id, code: b.code, name: b.name });
      }
    });
  }

  await writeAudit({
    tenantId: tenant.id,
    actorUserId: actorUserId ?? null,
    action: 'tenant.onboard',
    resourceType: 'tenant',
    resourceId: tenant.id,
    metadata: { code: tenant.code, adminEmail: input.admin.email, modules: moduleOrder },
  });

  return { tenant, admin: { email: input.admin.email, tempPassword } };
}

// Platform-level list (the `tenants` table has no RLS). Per-tenant detail is fetched in that
// tenant's own context (getTenantDetail), never by cross-tenant RLS-table scans.
export async function listTenants(): Promise<Tenant[]> {
  return db.select().from(tenants).orderBy(tenants.createdAt);
}

export type TenantDetail = Tenant & {
  modules: string[];
  branches: Array<{ id: string; code: string; name: string; isActive: boolean }>;
  userCount: number;
};

export async function getTenantDetail(tenantId: string): Promise<TenantDetail | null> {
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  if (!tenant) return null;

  const modules = Array.from(await listEntitledModules(tenantId)).sort();
  const { branchRows, userCount } = await runWithTenant(tenantId, async (tx) => {
    const branchRows = await tx
      .select()
      .from(branches)
      .where(eq(branches.tenantId, tenantId));
    const c = (
      await tx.select({ c: count() }).from(users).where(eq(users.tenantId, tenantId))
    )[0];
    return { branchRows, userCount: Number(c?.c ?? 0) };
  });

  return {
    ...tenant,
    modules,
    branches: branchRows.map((b) => ({ id: b.id, code: b.code, name: b.name, isActive: b.isActive })),
    userCount,
  };
}

export async function setTenantStatus(
  tenantId: string,
  status: string,
  actorUserId?: string,
): Promise<Tenant> {
  const updated = (
    await db
      .update(tenants)
      .set({ status, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
      .returning()
  )[0];
  if (!updated) throw Errors.notFound('Tenant not found');
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'tenant.status',
    resourceType: 'tenant',
    resourceId: tenantId,
    metadata: { status },
  });
  return updated;
}

export async function grantTenantModule(
  tenantId: string,
  moduleKey: string,
  actorUserId?: string,
): Promise<void> {
  if (!moduleDef(moduleKey)) throw Errors.validation(undefined, `Unknown module: ${moduleKey}`);
  // Grant the module plus any hard dependencies it needs, in order.
  for (const m of resolveModuleOrder([moduleKey])) {
    await grantModule(tenantId, m, { grantedBy: actorUserId, reason: 'admin grant' });
  }
}

export async function revokeTenantModule(
  tenantId: string,
  moduleKey: string,
  _actorUserId?: string,
): Promise<void> {
  if (!moduleDef(moduleKey)) throw Errors.validation(undefined, `Unknown module: ${moduleKey}`);
  // Soft transition (never physical delete — invariant #6). setModuleStatus audits the change.
  await setModuleStatus(tenantId, moduleKey, 'CANCELLED', 'admin revoke');
}

// The vendor's own org code — excluded from "hospital" counts (it is not a hospital, ADR-022).
const PLATFORM_CODE = 'PLATFORM';

export type PlatformStats = {
  organizations: { total: number; active: number; inactive: number };
  hospitals: { total: number; active: number; inactive: number };
  branches: { total: number; active: number };
  doctors: number;
  users: number;
  modules: Array<{ module: string; name: string; tenants: number }>;
  // Present once the clinical modules land (Stage 1); null until then so tiles degrade gracefully.
  patients: number | null;
  appointments: number | null;
};

// Platform-wide statistics for the System Admin dashboard. AGGREGATE-ONLY + super-admin-gated
// (ADR-023) — counts only, never another tenant's row-level data. Read path (MVP): the non-RLS
// `tenants` table for org counts, plus a per-tenant `runWithTenant` COUNT loop for tenant-scoped
// entities (correct under a non-superuser prod role). Evolve to a materialized snapshot at scale.
export async function getPlatformStats(): Promise<PlatformStats> {
  const all = await db.select().from(tenants);
  const isActive = (t: Tenant): boolean => t.status === 'active';
  const hospitals = all.filter((t) => t.code !== PLATFORM_CODE);

  let userTotal = 0;
  let doctorTotal = 0;
  let branchTotal = 0;
  let branchActive = 0;
  const moduleUsage = new Map<string, number>();

  for (const t of all) {
    await runWithTenant(t.id, async (tx) => {
      const u = (await tx.select({ c: count() }).from(users).where(eq(users.tenantId, t.id)))[0];
      userTotal += Number(u?.c ?? 0);
      const p = (await tx.select({ c: count() }).from(providers).where(eq(providers.tenantId, t.id)))[0];
      doctorTotal += Number(p?.c ?? 0);
      const brs = await tx.select().from(branches).where(eq(branches.tenantId, t.id));
      branchTotal += brs.length;
      branchActive += brs.filter((b) => b.isActive).length;
    });
    for (const m of await listEntitledModules(t.id)) {
      moduleUsage.set(m, (moduleUsage.get(m) ?? 0) + 1);
    }
  }

  return {
    organizations: {
      total: all.length,
      active: all.filter(isActive).length,
      inactive: all.filter((t) => !isActive(t)).length,
    },
    hospitals: {
      total: hospitals.length,
      active: hospitals.filter(isActive).length,
      inactive: hospitals.filter((t) => !isActive(t)).length,
    },
    branches: { total: branchTotal, active: branchActive },
    doctors: doctorTotal,
    users: userTotal,
    modules: MODULE_CATALOG.filter((m) => moduleUsage.has(m.key)).map((m) => ({
      module: m.key,
      name: m.name,
      tenants: moduleUsage.get(m.key) ?? 0,
    })),
    patients: null, // Stage 1
    appointments: null, // Stage 1
  };
}

// Guard: does this tenant exist? (base db, no RLS)
export async function tenantExists(tenantId: string): Promise<boolean> {
  const row = (await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  return !!row;
}
