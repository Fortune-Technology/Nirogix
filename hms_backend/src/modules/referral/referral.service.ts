import { and, desc, eq } from 'drizzle-orm';
import { runWithTenant, type TenantTx } from '../../db/tenantContext';
import { referrals, visits, patients, providers, departments } from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';

/**
 * In-hospital referrals (ADR-068). A referral is a pointer, not a chart: the doctor
 * sends the patient to a department, the front desk checks the patient in against it
 * (which is what completes it and links the resulting visit), and the receiving side
 * reads the same record — "transferred" means opened, never copied.
 */

export interface CreateReferralInput {
  visitId: string;
  toDepartmentId: string;
  toProviderId?: string | null;
  reason: string;
}

const listColumns = {
  r: referrals,
  patientFirst: patients.firstName,
  patientLast: patients.lastName,
  patientUhid: patients.uhid,
  departmentName: departments.name,
  visitNumber: visits.visitNumber,
};

function toDto(row: {
  r: typeof referrals.$inferSelect;
  patientFirst: string;
  patientLast: string | null;
  patientUhid: string;
  departmentName: string;
  visitNumber: string;
  fromProviderName?: string | null;
  toProviderName?: string | null;
}) {
  const r = row.r;
  return {
    id: r.id,
    visitId: r.visitId,
    visitNumber: row.visitNumber,
    patientId: r.patientId,
    patientName: `${row.patientFirst} ${row.patientLast ?? ''}`.trim(),
    patientUhid: row.patientUhid,
    fromProviderId: r.fromProviderId,
    fromProviderName: row.fromProviderName ?? null,
    toDepartmentId: r.toDepartmentId,
    toDepartmentName: row.departmentName,
    toProviderId: r.toProviderId,
    toProviderName: row.toProviderName ?? null,
    reason: r.reason,
    status: r.status,
    resultingVisitId: r.resultingVisitId,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  };
}

export async function createReferral(tenantId: string, input: CreateReferralInput, actorUserId?: string) {
  const created = await runWithTenant(tenantId, async (tx) => {
    const visit = (
      await tx.select().from(visits).where(and(eq(visits.tenantId, tenantId), eq(visits.id, input.visitId))).limit(1)
    )[0];
    if (!visit) throw Errors.notFound('Visit not found');
    if (visit.status === 'cancelled') throw Errors.conflict('Cannot refer from a cancelled visit');

    const dept = (
      await tx
        .select({ id: departments.id, isActive: departments.isActive })
        .from(departments)
        .where(and(eq(departments.tenantId, tenantId), eq(departments.id, input.toDepartmentId)))
        .limit(1)
    )[0];
    if (!dept) throw Errors.notFound('Department not found');
    if (!dept.isActive) throw Errors.validation(undefined, 'That department is no longer active');

    if (input.toProviderId) {
      const prov = (
        await tx
          .select({ id: providers.id, isActive: providers.isActive })
          .from(providers)
          .where(and(eq(providers.tenantId, tenantId), eq(providers.id, input.toProviderId)))
          .limit(1)
      )[0];
      if (!prov) throw Errors.notFound('Provider not found');
      if (!prov.isActive) throw Errors.validation(undefined, 'That doctor is no longer active');
    }

    // Who referred: the provider linked to the acting user, else the visit's own provider.
    let fromProviderId = visit.providerId ?? null;
    if (actorUserId) {
      const own = (
        await tx
          .select({ id: providers.id })
          .from(providers)
          .where(and(eq(providers.tenantId, tenantId), eq(providers.userId, actorUserId)))
          .limit(1)
      )[0];
      if (own) fromProviderId = own.id;
    }

    return (
      await tx
        .insert(referrals)
        .values({
          tenantId,
          visitId: input.visitId,
          patientId: visit.patientId,
          fromProviderId,
          toDepartmentId: input.toDepartmentId,
          toProviderId: input.toProviderId ?? null,
          reason: input.reason.trim(),
          createdBy: actorUserId ?? null,
        })
        .returning()
    )[0]!;
  });

  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'referral.create',
    resourceType: 'referral',
    resourceId: created.id,
    metadata: { visitId: input.visitId, toDepartmentId: input.toDepartmentId, patientId: created.patientId },
  });
  return getReferral(tenantId, created.id);
}

export async function getReferral(tenantId: string, referralId: string) {
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select(listColumns)
      .from(referrals)
      .innerJoin(patients, eq(patients.id, referrals.patientId))
      .innerJoin(departments, eq(departments.id, referrals.toDepartmentId))
      .innerJoin(visits, eq(visits.id, referrals.visitId))
      .where(and(eq(referrals.tenantId, tenantId), eq(referrals.id, referralId)))
      .limit(1);
    if (!rows[0]) throw Errors.notFound('Referral not found');
    return toDto(await withProviderNames(tx, rows[0]));
  });
}

// Provider names via a second small lookup — two nullable self-joins on providers would
// need aliases for no real gain at worklist sizes.
async function withProviderNames<T extends { r: typeof referrals.$inferSelect }>(
  tx: TenantTx,
  row: T,
): Promise<T & { fromProviderName: string | null; toProviderName: string | null }> {
  const ids = [row.r.fromProviderId, row.r.toProviderId].filter((x): x is string => Boolean(x));
  if (ids.length === 0) return { ...row, fromProviderName: null, toProviderName: null };
  const provs = await tx
    .select({ id: providers.id, fullName: providers.fullName })
    .from(providers)
    .where(eq(providers.tenantId, row.r.tenantId));
  const byId = new Map(provs.map((p) => [p.id, p.fullName]));
  return {
    ...row,
    fromProviderName: row.r.fromProviderId ? (byId.get(row.r.fromProviderId) ?? null) : null,
    toProviderName: row.r.toProviderId ? (byId.get(row.r.toProviderId) ?? null) : null,
  };
}

export interface ListReferralsFilter {
  status?: string;
  toDepartmentId?: string;
  patientId?: string;
}

export async function listReferrals(tenantId: string, filter: ListReferralsFilter) {
  return runWithTenant(tenantId, async (tx) => {
    const conds = [eq(referrals.tenantId, tenantId)];
    if (filter.status) conds.push(eq(referrals.status, filter.status));
    if (filter.toDepartmentId) conds.push(eq(referrals.toDepartmentId, filter.toDepartmentId));
    if (filter.patientId) conds.push(eq(referrals.patientId, filter.patientId));
    const rows = await tx
      .select(listColumns)
      .from(referrals)
      .innerJoin(patients, eq(patients.id, referrals.patientId))
      .innerJoin(departments, eq(departments.id, referrals.toDepartmentId))
      .innerJoin(visits, eq(visits.id, referrals.visitId))
      .where(and(...conds))
      .orderBy(desc(referrals.createdAt));
    const withNames = [];
    for (const row of rows) withNames.push(toDto(await withProviderNames(tx, row)));
    return withNames;
  });
}

export async function cancelReferral(tenantId: string, referralId: string, actorUserId?: string) {
  await runWithTenant(tenantId, async (tx) => {
    const moved = await tx
      .update(referrals)
      .set({ status: 'cancelled', cancelledAt: new Date() })
      .where(and(eq(referrals.tenantId, tenantId), eq(referrals.id, referralId), eq(referrals.status, 'pending')))
      .returning({ id: referrals.id });
    if (!moved[0]) {
      const exists = (
        await tx.select({ id: referrals.id }).from(referrals).where(and(eq(referrals.tenantId, tenantId), eq(referrals.id, referralId))).limit(1)
      )[0];
      if (!exists) throw Errors.notFound('Referral not found');
      throw Errors.conflict('Only a pending referral can be cancelled');
    }
  });
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'referral.cancel',
    resourceType: 'referral',
    resourceId: referralId,
    metadata: {},
  });
  return getReferral(tenantId, referralId);
}

/**
 * Called by OPD check-in when a visit is opened against a referral: links the resulting
 * visit and completes the referral, inside the caller's transaction. CAS on `pending` so
 * two desks cannot both consume it.
 */
export async function completeReferralTx(
  tx: TenantTx,
  tenantId: string,
  referralId: string,
  resultingVisitId: string,
): Promise<void> {
  const moved = await tx
    .update(referrals)
    .set({ status: 'completed', completedAt: new Date(), resultingVisitId })
    .where(and(eq(referrals.tenantId, tenantId), eq(referrals.id, referralId), eq(referrals.status, 'pending')))
    .returning({ id: referrals.id });
  if (!moved[0]) throw Errors.conflict('This referral has already been used or cancelled');
}
