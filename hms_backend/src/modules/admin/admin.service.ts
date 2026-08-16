import { randomBytes } from 'node:crypto';
import { and, count, eq, gte } from 'drizzle-orm';
import { db } from '../../db/client';
import { runWithTenant } from '../../db/tenantContext';
import {
  tenants,
  users,
  branches,
  providers,
  patients,
  appointments,
  auditLog,
  type Tenant,
} from '../../db/schema';
import { Errors } from '../../http/error';
import { hashPassword } from '../auth/password';
import { provisionTenantRbac, assignRoleByKey, listUserRoles } from '../rbac/rbac.service';
import {
  grantModule,
  setModuleStatus,
  listEntitledModules,
} from '../entitlement/entitlement.service';
import { MODULE_CATALOG, moduleDef } from '../entitlement/moduleCatalog';
import { writeAudit } from '../audit/audit.service';
import { issueImpersonatedSession, toPublicUserRow } from '../auth/auth.service';
import type { PublicUser } from '../auth/auth.schema';

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
  /** Identity only, for tenant administration and support-session targeting (ADR-037). */
  users: Array<{ id: string; email: string; fullName: string; status: string; roles: string[] }>;
  modules: string[];
  branches: Array<{ id: string; code: string; name: string; isActive: boolean }>;
  userCount: number;
};

export async function getTenantDetail(tenantId: string): Promise<TenantDetail | null> {
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  if (!tenant) return null;

  const modules = Array.from(await listEntitledModules(tenantId)).sort();
  const { branchRows, userCount, userRows } = await runWithTenant(tenantId, async (tx) => {
    const branchRows = await tx
      .select()
      .from(branches)
      .where(eq(branches.tenantId, tenantId));
    const c = (
      await tx.select({ c: count() }).from(users).where(eq(users.tenantId, tenantId))
    )[0];
    // Identity only — never clinical data. The operator needs this to choose a
    // support-session target (ADR-037) and to see who administers the tenant.
    const userRows = await tx
      .select({ id: users.id, email: users.email, fullName: users.fullName, status: users.status })
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .limit(100);
    return { branchRows, userCount: Number(c?.c ?? 0), userRows };
  });

  const withRoles = await Promise.all(
    userRows.map(async (u) => ({ ...u, roles: (await listUserRoles(tenantId, u.id)).map((r) => r.key) })),
  );

  return {
    ...tenant,
    modules,
    branches: branchRows.map((b) => ({ id: b.id, code: b.code, name: b.name, isActive: b.isActive })),
    userCount,
    users: withRoles,
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
  let patientTotal = 0;
  let appointmentTotal = 0;
  const moduleUsage = new Map<string, number>();

  for (const t of all) {
    await runWithTenant(t.id, async (tx) => {
      const u = (await tx.select({ c: count() }).from(users).where(eq(users.tenantId, t.id)))[0];
      userTotal += Number(u?.c ?? 0);
      const p = (await tx.select({ c: count() }).from(providers).where(eq(providers.tenantId, t.id)))[0];
      doctorTotal += Number(p?.c ?? 0);
      const pt = (await tx.select({ c: count() }).from(patients).where(eq(patients.tenantId, t.id)))[0];
      patientTotal += Number(pt?.c ?? 0);
      const ap = (await tx.select({ c: count() }).from(appointments).where(eq(appointments.tenantId, t.id)))[0];
      appointmentTotal += Number(ap?.c ?? 0);
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
    patients: patientTotal,
    appointments: appointmentTotal,
  };
}

// ---- Platform trends (System Admin dashboard) --------------------------------
// Every series below is DERIVED FROM REAL ROWS — `created_at` on the tenant, user,
// patient and appointment tables, and the audit log's own timestamps. Nothing here
// is estimated or projected: a metric with no data source does not get a tile
// (ADR-037, ADR-043). Aggregate-only and super-admin gated like `getPlatformStats`
// (ADR-023) — counts per period, never another tenant's rows.

export type TrendPoint = { period: string; created: number; cumulative: number };
export type SeverityPoint = { period: string; info: number; warning: number; critical: number };

export type PlatformTrends = {
  /** Inclusive month range actually covered, `YYYY-MM`. */
  from: string;
  to: string;
  hospitals: TrendPoint[];
  users: TrendPoint[];
  patients: TrendPoint[];
  appointments: TrendPoint[];
  /** Audit events per day for the trailing window, split by severity. */
  events: SeverityPoint[];
};

/** `YYYY-MM` for a date, in UTC — the bucket key for a monthly series. */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The last `months` month keys, oldest first, ending with the current month. Exported for unit tests. */
export function monthWindow(months: number, now: Date): string[] {
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    keys.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  return keys;
}

/**
 * Buckets `created_at` values into the month window and carries a running total.
 * `priorTotal` is everything created BEFORE the window, so the cumulative line
 * starts from the real total rather than zero.
 */
export function toSeries(dates: Date[], window: string[]): TrendPoint[] {
  const byMonth = new Map<string, number>();
  let priorTotal = 0;
  const first = window[0] ?? '';
  for (const d of dates) {
    const key = monthKey(d);
    if (key < first) priorTotal += 1;
    else byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }
  let running = priorTotal;
  return window.map((period) => {
    const created = byMonth.get(period) ?? 0;
    running += created;
    return { period, created, cumulative: running };
  });
}

export async function getPlatformTrends(months: number, now = new Date()): Promise<PlatformTrends> {
  const window = monthWindow(months, now);
  const all = await db.select().from(tenants);
  const hospitalRows = all.filter((t) => t.code !== PLATFORM_CODE);

  const userDates: Date[] = [];
  const patientDates: Date[] = [];
  const appointmentDates: Date[] = [];

  for (const t of all) {
    await runWithTenant(t.id, async (tx) => {
      const u = await tx.select({ at: users.createdAt }).from(users).where(eq(users.tenantId, t.id));
      for (const r of u) if (r.at) userDates.push(new Date(r.at));
      const p = await tx
        .select({ at: patients.createdAt })
        .from(patients)
        .where(eq(patients.tenantId, t.id));
      for (const r of p) if (r.at) patientDates.push(new Date(r.at));
      const a = await tx
        .select({ at: appointments.createdAt })
        .from(appointments)
        .where(eq(appointments.tenantId, t.id));
      for (const r of a) if (r.at) appointmentDates.push(new Date(r.at));
    });
  }

  return {
    from: window[0] ?? monthKey(now),
    to: window[window.length - 1] ?? monthKey(now),
    hospitals: toSeries(
      hospitalRows.map((t) => new Date(t.createdAt)),
      window,
    ),
    users: toSeries(userDates, window),
    patients: toSeries(patientDates, window),
    appointments: toSeries(appointmentDates, window),
    events: await auditSeverityByDay(30, now),
  };
}

/** Audit events per day for the trailing `days`, split by severity. */
async function auditSeverityByDay(days: number, now: Date): Promise<SeverityPoint[]> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
  const rows = await db
    .select({ at: auditLog.createdAt, severity: auditLog.severity })
    .from(auditLog)
    .where(gte(auditLog.createdAt, start));

  const buckets = new Map<string, SeverityPoint>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    const period = d.toISOString().slice(0, 10);
    buckets.set(period, { period, info: 0, warning: 0, critical: 0 });
  }
  for (const r of rows) {
    if (!r.at) continue;
    const period = new Date(r.at).toISOString().slice(0, 10);
    const b = buckets.get(period);
    if (!b) continue;
    if (r.severity === 'critical') b.critical += 1;
    else if (r.severity === 'warning') b.warning += 1;
    else b.info += 1;
  }
  return [...buckets.values()];
}

// Guard: does this tenant exist? (base db, no RLS)
export async function tenantExists(tenantId: string): Promise<boolean> {
  const row = (await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  return !!row;
}

/** The tenants table is platform-managed (no RLS), so this reads outside runWithTenant. */
async function getTenantRow(tenantId: string): Promise<Tenant | null> {
  const rows = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return rows[0] ?? null;
}

// ---- Support sessions / impersonation (ADR-037) -----------------------------
// A platform operator troubleshoots inside a hospital without ever holding the
// customer's password. The rules that make this safe, all enforced here:
//   * the caller must hold platform.support.impersonate (checked at the route);
//   * the target tenant and user must both be active;
//   * a platform operator can never be impersonated — no escalation path;
//   * the session grants exactly the target's roles, never the operator's;
//   * start and end are both audited, in the target tenant, with a reason.

export type SupportSessionInput = {
  tenantId: string;
  userId: string;
  reason: string;
  ticketRef?: string;
};

export async function startSupportSession(
  operator: { userId: string; tenantId: string },
  input: SupportSessionInput,
  meta: { userAgent?: string; ip?: string },
): Promise<{ accessToken: string; refreshToken: string; user: PublicUser; tenant: { id: string; name: string } }> {
  const tenant = await getTenantRow(input.tenantId);
  if (!tenant) throw Errors.notFound('Tenant not found');
  if (tenant.status !== 'active') throw Errors.validation(undefined, 'That tenant is not active');

  const target = await runWithTenant(input.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, input.userId), eq(users.tenantId, input.tenantId)))
      .limit(1);
    return rows[0] ?? null;
  });
  if (!target) throw Errors.notFound('User not found in that tenant');
  if (target.status !== 'active') throw Errors.validation(undefined, 'That user account is not active');
  if (target.id === operator.userId) throw Errors.validation(undefined, 'You cannot impersonate yourself');

  // No escalation: a support session may never target another platform operator.
  const targetRoles = (await listUserRoles(input.tenantId, target.id)).map((r) => r.key);
  if (targetRoles.includes('super_admin')) {
    throw Errors.forbidden('A platform operator cannot be impersonated');
  }

  const session = await issueImpersonatedSession(input.tenantId, target.id, targetRoles, {
    ...meta,
    impersonatedBy: operator.userId,
    reason: input.reason,
  });

  // Audited in the TARGET tenant, so the hospital's own audit trail shows that an
  // outside operator was inside it, with who, why and when.
  await writeAudit({
    tenantId: input.tenantId,
    actorUserId: operator.userId,
    action: 'support.session.start',
    severity: 'warning',
    resourceType: 'user',
    resourceId: target.id,
    metadata: {
      operatorUserId: operator.userId,
      operatorTenantId: operator.tenantId,
      targetUserEmail: target.email,
      reason: input.reason,
      ticketRef: input.ticketRef ?? null,
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return {
    ...session,
    user: toPublicUserRow(target),
    tenant: { id: tenant.id, name: tenant.name },
  };
}
