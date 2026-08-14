import { randomBytes } from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { runWithTenant } from '../../db/tenantContext';
import { tenants, users, branches, type Tenant } from '../../db/schema';
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

// Guard: does this tenant exist? (base db, no RLS)
export async function tenantExists(tenantId: string): Promise<boolean> {
  const row = (await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  return !!row;
}
