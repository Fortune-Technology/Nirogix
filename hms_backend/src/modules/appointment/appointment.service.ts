import { and, count, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { parseSort, resolveSort, type SortableColumns } from '../../db/sort';
import { runWithTenant } from '../../db/tenantContext';
import {
  appointments,
  departments,
  patients,
  providers,
  providerSchedules,
  type Appointment,
} from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';
import { eventBus } from '../../events/eventBus';

// "HH:mm" → minutes from local midnight. The roster is hospital wall-clock (ADR-069);
// appointments stay timestamptz and are compared in the server's local time, which is
// the hospital's own timezone in every deployment profile (India-resident, single-TZ).
function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export type BookInput = {
  patientId: string;
  providerId: string;
  scheduledAt: string; // ISO datetime
  durationMinutes?: number;
  reason?: string | null;
  branchId?: string | null;
  /** Validated against this tenant and refused when retired, exactly as a visit does (ADR-050). */
  departmentId?: string | null;
  /**
   * Why the patient is coming (ADR-115) — `appointment` for a first visit with this doctor,
   * `follow_up` for a return. Carried onto the visit when the appointment is checked in, so the
   * distinction survives the wait rather than having to be remembered at the desk.
   */
  arrivalType?: 'appointment' | 'follow_up' | null;
};

/**
 * The sort keys this endpoint publishes, and what each one orders by (ADR-136).
 *
 * Keyed by the DataTable **column key** the Portal uses, so what a person clicks and what the
 * server sorts on are the same name. A client never gets to name a column: an unlisted key is
 * dropped and the workflow-aware default stands.
 */
const APPOINTMENT_SORT: SortableColumns = {
  when: appointments.scheduledAt,
  patient: patients.firstName,
  provider: providers.fullName,
  dur: appointments.durationMinutes,
  status: appointments.status,
};

export type AppointmentView = {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  reason: string | null;
  patientId: string;
  patientName: string;
  patientUhid: string;
  providerId: string;
  providerName: string;
  departmentId: string | null;
  departmentName: string | null;
  arrivalType: string;
};

function endOf(startIso: string, durationMinutes: number): number {
  return new Date(startIso).getTime() + durationMinutes * 60_000;
}

// Books an appointment. Rejects a slot that overlaps another *booked* appointment for the same
// provider (double-booking prevention — phases.md MVP 0 acceptance). Publishes appointment.booked.
export async function bookAppointment(
  tenantId: string,
  input: BookInput,
  actorUserId?: string,
): Promise<Appointment> {
  const duration = input.durationMinutes ?? 15;
  const newStart = new Date(input.scheduledAt).getTime();
  const newEnd = endOf(input.scheduledAt, duration);

  const appointment = await runWithTenant(tenantId, async (tx) => {
    // Patient + provider must exist in this tenant.
    const patient = (
      await tx
        .select({ id: patients.id })
        .from(patients)
        .where(and(eq(patients.tenantId, tenantId), eq(patients.id, input.patientId)))
        .limit(1)
    )[0];
    if (!patient) throw Errors.notFound('Patient not found');
    const provider = (
      await tx
        .select({ id: providers.id })
        .from(providers)
        .where(and(eq(providers.tenantId, tenantId), eq(providers.id, input.providerId)))
        .limit(1)
    )[0];
    if (!provider) throw Errors.notFound('Provider not found');

    // The department must be this hospital's own and still active — the same rule check-in
    // applies (ADR-050). One form asking one question must not mean two different answers.
    if (input.departmentId) {
      const dept = (
        await tx
          .select({ isActive: departments.isActive })
          .from(departments)
          .where(and(eq(departments.tenantId, tenantId), eq(departments.id, input.departmentId)))
          .limit(1)
      )[0];
      if (!dept) throw Errors.notFound('Department not found');
      if (!dept.isActive) throw Errors.validation(undefined, 'That department is no longer active');
    }

    // Roster rule (ADR-069): WHEN the provider has an active weekly roster, the booking
    // must start inside one of that weekday's windows. A provider with no roster keeps
    // free-form booking — configuring availability is opt-in, not a breaking change.
    const windows = await tx
      .select()
      .from(providerSchedules)
      .where(
        and(
          eq(providerSchedules.tenantId, tenantId),
          eq(providerSchedules.providerId, input.providerId),
          eq(providerSchedules.isActive, true),
        ),
      );
    if (windows.length > 0) {
      const local = new Date(input.scheduledAt);
      const weekday = local.getDay();
      const minutes = local.getHours() * 60 + local.getMinutes();
      const inWindow = windows.some(
        (w) =>
          w.weekday === weekday &&
          minutes >= hhmmToMinutes(w.startTime) &&
          minutes + duration <= hhmmToMinutes(w.endTime),
      );
      if (!inWindow) {
        throw Errors.conflict(
          'The doctor is not available at that time. Pick a slot from their schedule',
        );
      }
    }

    // Double-booking check: any BOOKED appointment for this provider whose window overlaps.
    const existing = await tx
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          eq(appointments.providerId, input.providerId),
          eq(appointments.status, 'booked'),
        ),
      );
    for (const e of existing) {
      const eStart = e.scheduledAt.getTime();
      const eEnd = eStart + e.durationMinutes * 60_000;
      if (newStart < eEnd && eStart < newEnd) {
        throw Errors.conflict('The provider already has an appointment in this time slot');
      }
    }

    const rows = await tx
      .insert(appointments)
      .values({
        tenantId,
        patientId: input.patientId,
        providerId: input.providerId,
        scheduledAt: new Date(input.scheduledAt),
        durationMinutes: duration,
        reason: input.reason ?? null,
        branchId: input.branchId ?? null,
        departmentId: input.departmentId ?? null,
        arrivalType: input.arrivalType ?? 'appointment',
        createdBy: actorUserId ?? null,
      })
      .returning();
    return rows[0]!;
  });

  eventBus.publish('appointment.booked', {
    tenantId,
    appointmentId: appointment.id,
    patientId: appointment.patientId,
  });
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'appointment.book',
    resourceType: 'appointment',
    resourceId: appointment.id,
    metadata: {
      providerId: input.providerId,
      patientId: input.patientId,
      scheduledAt: input.scheduledAt,
    },
  });
  return appointment;
}

export async function listAppointments(
  tenantId: string,
  opts: {
    page: number;
    pageSize: number;
    from?: string;
    to?: string;
    providerId?: string;
    patientId?: string;
    status?: readonly string[];
    /** `key:dir` pairs from the table header. Unknown keys fall back to the default order. */
    sort?: string;
  },
): Promise<{ rows: AppointmentView[]; total: number }> {
  return runWithTenant(tenantId, async (tx) => {
    const filters = [eq(appointments.tenantId, tenantId)];
    if (opts.from) filters.push(gte(appointments.scheduledAt, new Date(opts.from)));
    if (opts.to) filters.push(lte(appointments.scheduledAt, new Date(opts.to)));
    if (opts.providerId) filters.push(eq(appointments.providerId, opts.providerId));
    if (opts.patientId) filters.push(eq(appointments.patientId, opts.patientId));
    if (opts.status?.length) filters.push(inArray(appointments.status, opts.status as string[]));
    const where = and(...filters);

    const rows = await tx
      .select({
        id: appointments.id,
        scheduledAt: appointments.scheduledAt,
        durationMinutes: appointments.durationMinutes,
        status: appointments.status,
        reason: appointments.reason,
        patientId: appointments.patientId,
        patientFirst: patients.firstName,
        patientLast: patients.lastName,
        patientUhid: patients.uhid,
        providerId: appointments.providerId,
        providerName: providers.fullName,
        departmentId: appointments.departmentId,
        departmentName: departments.name,
        arrivalType: appointments.arrivalType,
      })
      .from(appointments)
      .innerJoin(patients, eq(patients.id, appointments.patientId))
      .innerJoin(providers, eq(providers.id, appointments.providerId))
      .leftJoin(departments, eq(departments.id, appointments.departmentId))
      .where(where)
      // What is coming, soonest first — then what has been, most recent first (ADR-136).
      //
      // Only when the user has not asked for something else. The table offers sorting on every
      // column that knows its value, and this endpoint used to drop the parameter: the arrow
      // moved, the URL changed, the rows did not.
      //
      // Plain `scheduledAt DESC` put the FURTHEST-AWAY appointment at the top, so a booking three
      // months out sat above this morning's clinic and today's list was somewhere in the middle of
      // page one. Nobody looks at a schedule to find out what happens in March.
      //
      // Two keys, not one: the first splits future from past, the second orders each half in its
      // own direction. A date filter narrows the set; it does not change which end matters.
      .orderBy(
        ...(resolveSort(parseSort(opts.sort), APPOINTMENT_SORT) ?? [
          sql`case when ${appointments.scheduledAt} >= now() then 0 else 1 end`,
          sql`case when ${appointments.scheduledAt} >= now() then ${appointments.scheduledAt} end asc`,
          sql`case when ${appointments.scheduledAt} < now() then ${appointments.scheduledAt} end desc`,
        ]),
      )
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize);

    const total = Number(
      (await tx.select({ c: count() }).from(appointments).where(where))[0]?.c ?? 0,
    );

    return {
      rows: rows.map((r) => ({
        id: r.id,
        scheduledAt: r.scheduledAt.toISOString(),
        durationMinutes: r.durationMinutes,
        status: r.status,
        reason: r.reason,
        patientId: r.patientId,
        patientName: [r.patientFirst, r.patientLast].filter(Boolean).join(' '),
        patientUhid: r.patientUhid,
        providerId: r.providerId,
        providerName: r.providerName,
        departmentId: r.departmentId,
        departmentName: r.departmentName,
        arrivalType: r.arrivalType,
      })),
      total,
    };
  });
}

export async function cancelAppointment(
  tenantId: string,
  id: string,
  reason: string | undefined,
  actorUserId?: string,
): Promise<Appointment> {
  const updated = (
    await runWithTenant(tenantId, async (tx) => {
      const current = (
        await tx
          .select()
          .from(appointments)
          .where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, id)))
          .limit(1)
      )[0];
      if (!current) throw Errors.notFound('Appointment not found');
      if (current.status === 'cancelled') throw Errors.conflict('Appointment is already cancelled');
      return tx
        .update(appointments)
        .set({
          status: 'cancelled',
          cancelReason: reason ?? null,
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(appointments.id, id))
        .returning();
    })
  )[0]!;

  eventBus.publish('appointment.cancelled', { tenantId, appointmentId: id });
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'appointment.cancel',
    resourceType: 'appointment',
    resourceId: id,
    metadata: { reason: reason ?? null },
  });
  return updated;
}

// Count for the dashboard tiles (all appointments, tenant-scoped).
export async function countAppointments(tenantId: string): Promise<number> {
  return runWithTenant(tenantId, async (tx) => {
    const c = (
      await tx.select({ c: count() }).from(appointments).where(eq(appointments.tenantId, tenantId))
    )[0];
    return Number(c?.c ?? 0);
  });
}
