import { and, count, eq } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { visits, patients, providers, appointments, invoices, departments, type Visit as VisitRow } from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';
import { eventBus } from '../../events/eventBus';
import * as billing from '../billing/billing.service';

// OPD & Check-in (development-plan §11). The visit/encounter is the clinical record everything
// hangs off. Check-in also opens the patient's bill by asking the Financial Transaction
// Infrastructure (billing) to create a draft consultation-fee invoice — OPD never touches
// invoice/payment tables directly.

function today(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (server date)
}

export interface CheckInInput {
  patientId: string;
  appointmentId?: string | null;
  providerId?: string | null;
  branchId?: string | null;
  /** Deprecated free-text department. Kept for callers predating ADR-050. */
  department?: string | null;
  /** The department this visit belongs to (ADR-050). Validated against this tenant's own list. */
  departmentId?: string | null;
  reason?: string | null;
  consultationFeePaise: number;
}

// Flat column selection — predictable nullability (left-joined columns are nullable).
const visitColumns = {
  v: visits,
  patientFirst: patients.firstName,
  patientLast: patients.lastName,
  patientUhid: patients.uhid,
  providerName: providers.fullName,
  invId: invoices.id,
  invNumber: invoices.invoiceNumber,
  invStatus: invoices.status,
  invTotal: invoices.totalPaise,
  invPaid: invoices.amountPaidPaise,
};

type VisitRowFlat = {
  v: VisitRow;
  patientFirst: string;
  patientLast: string | null;
  patientUhid: string;
  providerName: string | null;
  invId: string | null;
  invNumber: string | null;
  invStatus: string | null;
  invTotal: number | null;
  invPaid: number | null;
};

function toVisitDto(row: VisitRowFlat) {
  const v = row.v;
  return {
    id: v.id,
    visitNumber: v.visitNumber,
    tokenNumber: v.tokenNumber,
    visitDate: v.visitDate,
    visitType: v.visitType,
    status: v.status,
    department: v.department,
    departmentId: v.departmentId,
    reason: v.reason,
    checkedInAt: v.checkedInAt.toISOString(),
    completedAt: v.completedAt ? v.completedAt.toISOString() : null,
    patientId: v.patientId,
    patientName: `${row.patientFirst} ${row.patientLast ?? ''}`.trim(),
    patientUhid: row.patientUhid,
    providerId: v.providerId,
    providerName: row.providerName,
    appointmentId: v.appointmentId,
    invoice:
      row.invId !== null
        ? {
            id: row.invId,
            invoiceNumber: row.invNumber ?? '',
            status: row.invStatus ?? '',
            totalPaise: row.invTotal ?? 0,
            amountPaidPaise: row.invPaid ?? 0,
            balancePaise: (row.invTotal ?? 0) - (row.invPaid ?? 0),
          }
        : null,
  };
}

// Assemble the API shape for one visit (with patient, provider, invoice summary).
export async function getVisit(tenantId: string, visitId: string) {
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select(visitColumns)
      .from(visits)
      .innerJoin(patients, eq(patients.id, visits.patientId))
      .leftJoin(providers, eq(providers.id, visits.providerId))
      .leftJoin(invoices, eq(invoices.id, visits.invoiceId))
      .where(and(eq(visits.tenantId, tenantId), eq(visits.id, visitId)))
      .limit(1);
    const row = rows[0];
    if (!row) throw Errors.notFound('Visit not found');
    return toVisitDto(row);
  });
}

export async function checkIn(tenantId: string, input: CheckInInput, actorUserId?: string) {
  const visitDate = today();

  const { visitId, existing } = await runWithTenant(tenantId, async (tx) => {
    // Validate the patient (tenant-scoped).
    const patient = (
      await tx.select({ id: patients.id }).from(patients).where(and(eq(patients.tenantId, tenantId), eq(patients.id, input.patientId))).limit(1)
    )[0];
    if (!patient) throw Errors.notFound('Patient not found');

    let providerId = input.providerId ?? null;

    // If checking in against an appointment: validate it, dedupe, and default the provider.
    if (input.appointmentId) {
      const appt = (
        await tx.select().from(appointments).where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, input.appointmentId))).limit(1)
      )[0];
      if (!appt) throw Errors.notFound('Appointment not found');
      const already = (
        await tx.select({ id: visits.id }).from(visits).where(and(eq(visits.tenantId, tenantId), eq(visits.appointmentId, input.appointmentId))).limit(1)
      )[0];
      if (already) return { visitId: already.id, existing: true }; // idempotent — already checked in
      if (!providerId) providerId = appt.providerId;
    }

    if (providerId) {
      const provider = (
        await tx.select({ id: providers.id }).from(providers).where(and(eq(providers.tenantId, tenantId), eq(providers.id, providerId))).limit(1)
      )[0];
      if (!provider) throw Errors.notFound('Provider not found');
    }

    // The department must be this hospital's own and still active — a visit cannot be checked
    // into a department that belongs to another tenant or has been retired (ADR-050). Its name
    // is copied into the legacy free-text column so screens reading `department` keep working.
    let departmentName: string | null = null;
    if (input.departmentId) {
      const dept = (
        await tx
          .select({ name: departments.name, isActive: departments.isActive })
          .from(departments)
          .where(and(eq(departments.tenantId, tenantId), eq(departments.id, input.departmentId)))
          .limit(1)
      )[0];
      if (!dept) throw Errors.notFound('Department not found');
      if (!dept.isActive) throw Errors.validation(undefined, 'That department is no longer active');
      departmentName = dept.name;
    }

    // Day's queue token for this branch (cosmetic; not a financial key).
    const branchConds = [eq(visits.tenantId, tenantId), eq(visits.visitDate, visitDate)];
    if (input.branchId) branchConds.push(eq(visits.branchId, input.branchId));
    const todayCount = Number((await tx.select({ c: count() }).from(visits).where(and(...branchConds)))[0]?.c ?? 0);
    const tokenNumber = todayCount + 1;

    // Tenant-monotonic visit number, retry on the unique conflict.
    const existingVisits = Number((await tx.select({ c: count() }).from(visits).where(eq(visits.tenantId, tenantId)))[0]?.c ?? 0);
    let row: VisitRow | undefined;
    for (let i = 1; i <= 8; i++) {
      const visitNumber = `V-${String(existingVisits + i).padStart(6, '0')}`;
      const inserted = await tx
        .insert(visits)
        .values({
          tenantId,
          branchId: input.branchId ?? null,
          patientId: input.patientId,
          providerId,
          appointmentId: input.appointmentId ?? null,
          visitNumber,
          tokenNumber,
          visitDate,
          department: departmentName ?? input.department ?? null,
          departmentId: input.departmentId ?? null,
          reason: input.reason ?? null,
          status: 'checked_in',
          checkedInBy: actorUserId ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted[0]) {
        row = inserted[0];
        break;
      }
    }
    if (!row) throw Errors.conflict('Could not allocate a visit number — please retry');
    return { visitId: row.id, existing: false };
  });

  if (existing) return getVisit(tenantId, visitId);

  // Open the bill via the Financial Transaction Infrastructure (draft consultation-fee invoice).
  if (input.consultationFeePaise > 0) {
    const invoice = await billing.createInvoice(
      tenantId,
      {
        patientId: input.patientId,
        branchId: input.branchId ?? null,
        visitId,
        lineItems: [
          {
            itemType: 'consultation',
            description: 'Consultation fee',
            quantity: 1,
            unitPricePaise: input.consultationFeePaise,
            sourceModule: 'opd',
            sourceRef: visitId,
          },
        ],
      },
      actorUserId,
    );
    await runWithTenant(tenantId, (tx) =>
      tx.update(visits).set({ invoiceId: invoice.id, updatedAt: new Date() }).where(eq(visits.id, visitId)),
    );
  }

  eventBus.publish('visit.checked_in', { tenantId, visitId, patientId: input.patientId });
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'visit.check_in',
    resourceType: 'visit',
    resourceId: visitId,
    metadata: { patientId: input.patientId, appointmentId: input.appointmentId ?? null },
  });
  return getVisit(tenantId, visitId);
}

export interface ListQueueFilter {
  branchId?: string;
  providerId?: string;
  date?: string;
  status?: string;
}

export async function listQueue(tenantId: string, filter: ListQueueFilter) {
  const visitDate = filter.date ?? today();
  return runWithTenant(tenantId, async (tx) => {
    const conds = [eq(visits.tenantId, tenantId), eq(visits.visitDate, visitDate)];
    if (filter.branchId) conds.push(eq(visits.branchId, filter.branchId));
    if (filter.providerId) conds.push(eq(visits.providerId, filter.providerId));
    if (filter.status) conds.push(eq(visits.status, filter.status));

    const rows = await tx
      .select(visitColumns)
      .from(visits)
      .innerJoin(patients, eq(patients.id, visits.patientId))
      .leftJoin(providers, eq(providers.id, visits.providerId))
      .leftJoin(invoices, eq(invoices.id, visits.invoiceId))
      .where(and(...conds))
      .orderBy(visits.tokenNumber);

    return rows.map(toVisitDto);
  });
}

const NEXT_STATUS: Record<string, string[]> = {
  checked_in: ['in_consultation', 'cancelled'],
  in_consultation: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export async function updateStatus(
  tenantId: string,
  visitId: string,
  status: string,
  version: number | undefined,
  actorUserId?: string,
) {
  await runWithTenant(tenantId, async (tx) => {
    const visit = (
      await tx.select().from(visits).where(and(eq(visits.tenantId, tenantId), eq(visits.id, visitId))).limit(1)
    )[0];
    if (!visit) throw Errors.notFound('Visit not found');
    if (version !== undefined && visit.version !== version) {
      throw Errors.conflict('This visit was updated by someone else — please refresh');
    }
    if (!(NEXT_STATUS[visit.status] ?? []).includes(status)) {
      throw Errors.conflict(`Cannot move a ${visit.status} visit to ${status}`);
    }
    await tx
      .update(visits)
      .set({
        status,
        completedAt: status === 'completed' ? new Date() : visit.completedAt,
        version: visit.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(visits.id, visitId));
  });

  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'visit.status',
    resourceType: 'visit',
    resourceId: visitId,
    metadata: { status },
  });
  return getVisit(tenantId, visitId);
}
