import { and, asc, count, eq } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { branches, departments, practitionerRoles, providers } from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';
import type { CreateDepartmentInput, UpdateDepartmentInput } from './department.schema';

/**
 * Departments (ADR-050) — the hospital's clinical organisation.
 *
 * Every statement runs inside `runWithTenant` and additionally carries an explicit `tenant_id`
 * predicate (ADR-015): RLS is the guarantee, the predicate is the defence in depth.
 *
 * Referential rules are enforced here rather than left to the database, so the caller gets a
 * usable message instead of a constraint violation: a department cannot be scoped to a branch
 * that is not this hospital's, cannot be headed by a provider from another hospital, and cannot
 * reuse a code that already exists.
 */

export type ResolvedDepartment = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  branchId: string | null;
  branchName: string | null;
  specialtyCode: string | null;
  headProviderId: string | null;
  headProviderName: string | null;
  providerCount: number;
  isActive: boolean;
  createdAt: string;
};

async function assertBranchBelongs(tenantId: string, branchId: string | null | undefined): Promise<void> {
  if (!branchId) return;
  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.tenantId, tenantId), eq(branches.id, branchId)))
      .limit(1),
  );
  if (!rows[0]) throw Errors.validation(undefined, 'That branch does not belong to your organization');
}

async function assertProviderBelongs(tenantId: string, providerId: string | null | undefined): Promise<void> {
  if (!providerId) return;
  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .select({ id: providers.id })
      .from(providers)
      .where(and(eq(providers.tenantId, tenantId), eq(providers.id, providerId)))
      .limit(1),
  );
  if (!rows[0]) throw Errors.validation(undefined, 'That provider does not belong to your organization');
}

export async function listDepartments(
  tenantId: string,
  filter: { activeOnly?: boolean; branchId?: string } = {},
): Promise<ResolvedDepartment[]> {
  const rows = await runWithTenant(tenantId, (tx) => {
    const where = [eq(departments.tenantId, tenantId)];
    if (filter.activeOnly) where.push(eq(departments.isActive, true));
    if (filter.branchId) where.push(eq(departments.branchId, filter.branchId));
    return tx
      .select({
        id: departments.id,
        code: departments.code,
        name: departments.name,
        description: departments.description,
        branchId: departments.branchId,
        branchName: branches.name,
        specialtyCode: departments.specialtyCode,
        headProviderId: departments.headProviderId,
        headProviderName: providers.fullName,
        isActive: departments.isActive,
        createdAt: departments.createdAt,
      })
      .from(departments)
      .leftJoin(branches, eq(branches.id, departments.branchId))
      .leftJoin(providers, eq(providers.id, departments.headProviderId))
      .where(and(...where))
      .orderBy(asc(departments.name));
  });

  const counts = await runWithTenant(tenantId, (tx) =>
    tx
      .select({ departmentId: practitionerRoles.departmentId, n: count() })
      .from(practitionerRoles)
      .where(and(eq(practitionerRoles.tenantId, tenantId), eq(practitionerRoles.isActive, true)))
      .groupBy(practitionerRoles.departmentId),
  );
  const byDept = new Map(counts.map((c) => [c.departmentId, Number(c.n)]));

  return rows.map((r) => ({
    ...r,
    providerCount: byDept.get(r.id) ?? 0,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getDepartment(tenantId: string, id: string): Promise<ResolvedDepartment> {
  const all = await listDepartments(tenantId);
  const found = all.find((d) => d.id === id);
  if (!found) throw Errors.notFound('Department not found');
  return found;
}

export async function createDepartment(
  tenantId: string,
  input: CreateDepartmentInput,
  actorUserId: string,
): Promise<ResolvedDepartment> {
  await assertBranchBelongs(tenantId, input.branchId);
  await assertProviderBelongs(tenantId, input.headProviderId);

  // Normalised HERE, not only in the request schema. The unique constraint is case-sensitive,
  // so "ortho" and "ORTHO" would otherwise be two departments — and the invariant has to hold
  // for every caller, including the seed and future internal ones, not just HTTP.
  const code = input.code.trim().toUpperCase();

  const clash = await runWithTenant(tenantId, (tx) =>
    tx
      .select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.tenantId, tenantId), eq(departments.code, code)))
      .limit(1),
  );
  if (clash[0]) throw Errors.conflict(`A department with code "${code}" already exists`);

  const row = await runWithTenant(tenantId, async (tx) => {
    const inserted = await tx
      .insert(departments)
      .values({
        tenantId,
        code,
        name: input.name,
        description: input.description ?? null,
        branchId: input.branchId ?? null,
        specialtyCode: input.specialtyCode ?? null,
        headProviderId: input.headProviderId ?? null,
      })
      .returning();
    return inserted[0]!;
  });

  await writeAudit({
    tenantId,
    actorUserId,
    action: 'department.create',
    severity: 'info',
    resourceType: 'department',
    resourceId: row.id,
    metadata: { code: row.code, name: row.name },
  });

  return getDepartment(tenantId, row.id);
}

export async function updateDepartment(
  tenantId: string,
  id: string,
  patch: UpdateDepartmentInput,
  actorUserId: string,
): Promise<ResolvedDepartment> {
  const existing = await getDepartment(tenantId, id); // 404s if it is not this hospital's
  if (patch.branchId !== undefined) await assertBranchBelongs(tenantId, patch.branchId);
  if (patch.headProviderId !== undefined) await assertProviderBelongs(tenantId, patch.headProviderId);

  await runWithTenant(tenantId, (tx) =>
    tx
      .update(departments)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.branchId !== undefined ? { branchId: patch.branchId } : {}),
        ...(patch.specialtyCode !== undefined ? { specialtyCode: patch.specialtyCode } : {}),
        ...(patch.headProviderId !== undefined ? { headProviderId: patch.headProviderId } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(departments.tenantId, tenantId), eq(departments.id, id))),
  );

  // Deactivation is the closest thing to a destructive action here — a department is never
  // deleted, because visits and encounters reference it — so it is audited at notice level.
  const deactivating = patch.isActive === false && existing.isActive;
  await writeAudit({
    tenantId,
    actorUserId,
    action: deactivating ? 'department.deactivate' : 'department.update',
    severity: deactivating ? 'notice' : 'info',
    resourceType: 'department',
    resourceId: id,
    metadata: { fields: Object.keys(patch), providerCount: existing.providerCount },
  });

  return getDepartment(tenantId, id);
}
