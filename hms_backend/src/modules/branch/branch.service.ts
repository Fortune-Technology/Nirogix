import { and, eq } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { branches, type Branch } from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';

export async function listBranches(tenantId: string): Promise<Branch[]> {
  return runWithTenant(tenantId, (tx) =>
    tx.select().from(branches).where(eq(branches.tenantId, tenantId)),
  );
}

export async function createBranch(
  tenantId: string,
  input: { code: string; name: string },
  actorUserId?: string,
): Promise<Branch> {
  const branch = await runWithTenant(tenantId, async (tx) => {
    const existing = (
      await tx
        .select()
        .from(branches)
        .where(and(eq(branches.tenantId, tenantId), eq(branches.code, input.code)))
        .limit(1)
    )[0];
    if (existing) throw Errors.conflict(`A branch with code "${input.code}" already exists`);
    return (
      await tx.insert(branches).values({ tenantId, code: input.code, name: input.name }).returning()
    )[0]!;
  });
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'branch.create',
    resourceType: 'branch',
    resourceId: branch.id,
    metadata: { code: input.code },
  });
  return branch;
}

export async function updateBranch(
  tenantId: string,
  id: string,
  patch: { name?: string; isActive?: boolean },
  actorUserId?: string,
): Promise<Branch> {
  const updated = (
    await runWithTenant(tenantId, (tx) =>
      tx
        .update(branches)
        .set({
          ...(patch.name ? { name: patch.name } : {}),
          ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(branches.tenantId, tenantId), eq(branches.id, id)))
        .returning(),
    )
  )[0];
  if (!updated) throw Errors.notFound('Branch not found');
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'branch.update',
    resourceType: 'branch',
    resourceId: id,
    metadata: patch,
  });
  return updated;
}
