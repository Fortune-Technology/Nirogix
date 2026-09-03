import { and, desc, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db } from '../../db/client';
import { runWithTenant } from '../../db/tenantContext';
import {
  appointmentRequests,
  organizationProfile,
  tenants,
  departments,
  providers,
} from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';
import { createPatient, getPatient } from '../patient/patient.service';
import { bookAppointment } from '../appointment/appointment.service';

/**
 * Public appointment requests (ADR-069) — the ADR-056 pattern applied to booking.
 *
 * The rule this module holds: **a submission is a request, not an appointment.** The
 * QR resolves the tenant server-side from an opaque token in the path; the visitor
 * states a wish (name, phone, preferred time, department); the front desk converts it
 * — matching or registering the patient through the same DUPLICATE_PATIENT flow as
 * every other registration, and booking through the same `bookAppointment` every
 * other booking uses (roster and double-booking rules included). Nothing on the
 * public path writes to `appointments` or `patients`.
 */

function newToken(): string {
  return randomBytes(24).toString('base64url');
}

export type PublicBookingContext = {
  hospitalName: string;
  city: string | null;
  enabled: boolean;
  /** What the public form lets the visitor pick between. Names only — no internals. */
  departments: Array<{ id: string; name: string }>;
  providers: Array<{ id: string; fullName: string }>;
};

/** Same uniform-failure contract as the registration token: typo, retired token and
 * disabled hospital are indistinguishable to an unauthenticated caller. */
export async function resolveBookingToken(
  token: string,
): Promise<{ tenantId: string; ctx: PublicBookingContext }> {
  if (!token || token.length < 16) throw Errors.notFound('That booking link is not valid');

  const rows = await db
    .select({
      tenantId: organizationProfile.tenantId,
      enabled: organizationProfile.onlineBookingEnabled,
      city: organizationProfile.city,
      displayName: organizationProfile.displayName,
      tenantName: tenants.name,
      tenantStatus: tenants.status,
    })
    .from(organizationProfile)
    .innerJoin(tenants, eq(tenants.id, organizationProfile.tenantId))
    .where(eq(organizationProfile.onlineBookingToken, token))
    .limit(1);

  const row = rows[0];
  if (!row || row.tenantStatus !== 'active')
    throw Errors.notFound('That booking link is not valid');

  const [depts, provs] = await runWithTenant(row.tenantId, async (tx) =>
    Promise.all([
      tx
        .select({ id: departments.id, name: departments.name })
        .from(departments)
        .where(and(eq(departments.tenantId, row.tenantId), eq(departments.isActive, true))),
      tx
        .select({ id: providers.id, fullName: providers.fullName })
        .from(providers)
        .where(and(eq(providers.tenantId, row.tenantId), eq(providers.isActive, true))),
    ]),
  );

  return {
    tenantId: row.tenantId,
    ctx: {
      hospitalName: row.displayName ?? row.tenantName,
      city: row.city,
      enabled: row.enabled,
      departments: depts,
      providers: provs,
    },
  };
}

export type SubmitBookingInput = {
  firstName: string;
  lastName?: string | null;
  phone: string;
  email?: string | null;
  preferredDate?: string | null;
  preferredTime?: string | null;
  departmentId?: string | null;
  providerId?: string | null;
  note?: string | null;
};

export async function submitBookingRequest(
  token: string,
  input: SubmitBookingInput,
  meta: { ip?: string } = {},
): Promise<{ received: true }> {
  const { tenantId, ctx } = await resolveBookingToken(token);
  if (!ctx.enabled) throw Errors.notFound('That booking link is not valid');

  // A wished-for department/provider must at least be one of this hospital's own —
  // anything else is dropped rather than stored (the desk picks the real one anyway).
  const departmentId =
    input.departmentId && ctx.departments.some((d) => d.id === input.departmentId)
      ? input.departmentId
      : null;
  const providerId =
    input.providerId && ctx.providers.some((p) => p.id === input.providerId)
      ? input.providerId
      : null;

  await runWithTenant(tenantId, (tx) =>
    tx.insert(appointmentRequests).values({
      tenantId,
      firstName: input.firstName.trim(),
      lastName: input.lastName?.trim() || null,
      phone: input.phone.trim(),
      email: input.email?.trim().toLowerCase() || null,
      preferredDate: input.preferredDate || null,
      preferredTime: input.preferredTime || null,
      departmentId,
      providerId,
      note: input.note?.trim() || null,
      submittedIp: meta.ip?.slice(0, 64) ?? null,
    }),
  );

  await writeAudit({
    tenantId,
    action: 'appointment.request.submitted',
    severity: 'info',
    resourceType: 'appointment_request',
    metadata: { source: 'qr' },
  });

  return { received: true };
}

// ---- Hospital side ----------------------------------------------------------

export async function listBookingRequests(tenantId: string, status = 'pending') {
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        r: appointmentRequests,
        departmentName: departments.name,
        providerName: providers.fullName,
      })
      .from(appointmentRequests)
      .leftJoin(departments, eq(departments.id, appointmentRequests.departmentId))
      .leftJoin(providers, eq(providers.id, appointmentRequests.providerId))
      .where(
        and(eq(appointmentRequests.tenantId, tenantId), eq(appointmentRequests.status, status)),
      )
      .orderBy(desc(appointmentRequests.createdAt));
    return rows.map((row) => ({
      id: row.r.id,
      firstName: row.r.firstName,
      lastName: row.r.lastName,
      phone: row.r.phone,
      email: row.r.email,
      preferredDate: row.r.preferredDate,
      preferredTime: row.r.preferredTime,
      departmentId: row.r.departmentId,
      departmentName: row.departmentName,
      providerId: row.r.providerId,
      providerName: row.providerName,
      note: row.r.note,
      status: row.r.status,
      appointmentId: row.r.appointmentId,
      patientId: row.r.patientId,
      createdAt: row.r.createdAt.toISOString(),
    }));
  });
}

export interface ApproveBookingInput {
  /** The actual slot the desk picked (the visitor's preference was only a wish). */
  scheduledAt: string;
  providerId: string;
  durationMinutes?: number;
  /** Link the request to an existing chart instead of creating one. */
  existingPatientId?: string;
  /** Register a new chart even though DUPLICATE_PATIENT matched. */
  allowDuplicate?: boolean;
}

/**
 * Convert a request into a patient (dedupe-guarded, or linked) + a real appointment
 * (same `bookAppointment` as staff booking — roster windows and double-booking rules
 * apply identically). The request row is kept as provenance.
 */
export async function approveBookingRequest(
  tenantId: string,
  requestId: string,
  input: ApproveBookingInput,
  actorUserId: string,
): Promise<{ appointmentId: string; patientId: string }> {
  const req = (
    await runWithTenant(tenantId, (tx) =>
      tx
        .select()
        .from(appointmentRequests)
        .where(
          and(eq(appointmentRequests.tenantId, tenantId), eq(appointmentRequests.id, requestId)),
        )
        .limit(1),
    )
  )[0];
  if (!req) throw Errors.notFound('Booking request not found');
  if (req.status !== 'pending') throw Errors.conflict('That request has already been reviewed');

  let patientId: string;
  if (input.existingPatientId) {
    const existing = await getPatient(tenantId, input.existingPatientId);
    if (!existing) throw Errors.notFound('That patient record was not found');
    patientId = existing.id;
  } else {
    const patient = await createPatient(
      tenantId,
      {
        firstName: req.firstName,
        lastName: req.lastName ?? undefined,
        phone: req.phone,
        email: req.email ?? undefined,
        allowDuplicate: input.allowDuplicate,
      },
      actorUserId,
    );
    patientId = patient.id;
  }

  const appointment = await bookAppointment(
    tenantId,
    {
      patientId,
      providerId: input.providerId,
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes,
      reason: req.note ?? null,
    },
    actorUserId,
  );

  await runWithTenant(tenantId, (tx) =>
    tx
      .update(appointmentRequests)
      .set({
        status: 'approved',
        appointmentId: appointment.id,
        patientId,
        reviewedBy: actorUserId,
        reviewedAt: new Date(),
      })
      .where(eq(appointmentRequests.id, requestId)),
  );

  await writeAudit({
    tenantId,
    actorUserId,
    action: 'appointment.request.approved',
    severity: 'notice',
    resourceType: 'appointment',
    resourceId: appointment.id,
    metadata: { requestId, patientId, linkedExisting: Boolean(input.existingPatientId) },
  });

  return { appointmentId: appointment.id, patientId };
}

export async function rejectBookingRequest(
  tenantId: string,
  requestId: string,
  reason: string | undefined,
  actorUserId: string,
) {
  await runWithTenant(tenantId, async (tx) => {
    const moved = await tx
      .update(appointmentRequests)
      .set({
        status: 'rejected',
        rejectionReason: reason?.trim() || null,
        reviewedBy: actorUserId,
        reviewedAt: new Date(),
      })
      .where(
        and(
          eq(appointmentRequests.tenantId, tenantId),
          eq(appointmentRequests.id, requestId),
          eq(appointmentRequests.status, 'pending'),
        ),
      )
      .returning({ id: appointmentRequests.id });
    if (!moved[0]) {
      const exists = (
        await tx
          .select({ id: appointmentRequests.id })
          .from(appointmentRequests)
          .where(
            and(eq(appointmentRequests.tenantId, tenantId), eq(appointmentRequests.id, requestId)),
          )
          .limit(1)
      )[0];
      if (!exists) throw Errors.notFound('Booking request not found');
      throw Errors.conflict('That request has already been reviewed');
    }
  });
  await writeAudit({
    tenantId,
    actorUserId,
    action: 'appointment.request.rejected',
    severity: 'info',
    resourceType: 'appointment_request',
    resourceId: requestId,
    metadata: {},
  });
  return { rejected: true as const };
}

// ---- Settings (org_admin) ----------------------------------------------------

export type BookingSettings = { enabled: boolean; token: string | null; pendingCount: number };

async function ensureProfile(tenantId: string): Promise<void> {
  await runWithTenant(tenantId, (tx) =>
    tx.insert(organizationProfile).values({ tenantId }).onConflictDoNothing(),
  );
}

export async function getBookingSettings(tenantId: string): Promise<BookingSettings> {
  await ensureProfile(tenantId);
  return runWithTenant(tenantId, async (tx) => {
    const profile = (
      await tx
        .select({
          enabled: organizationProfile.onlineBookingEnabled,
          token: organizationProfile.onlineBookingToken,
        })
        .from(organizationProfile)
        .where(eq(organizationProfile.tenantId, tenantId))
        .limit(1)
    )[0]!;
    const pending = await tx
      .select({ id: appointmentRequests.id })
      .from(appointmentRequests)
      .where(
        and(eq(appointmentRequests.tenantId, tenantId), eq(appointmentRequests.status, 'pending')),
      );
    return { enabled: profile.enabled, token: profile.token, pendingCount: pending.length };
  });
}

export async function setOnlineBooking(
  tenantId: string,
  enabled: boolean,
  actorUserId?: string,
): Promise<BookingSettings> {
  await ensureProfile(tenantId);
  await runWithTenant(tenantId, async (tx) => {
    const profile = (
      await tx
        .select({ token: organizationProfile.onlineBookingToken })
        .from(organizationProfile)
        .where(eq(organizationProfile.tenantId, tenantId))
        .limit(1)
    )[0]!;
    await tx
      .update(organizationProfile)
      .set({
        onlineBookingEnabled: enabled,
        // First enable mints the token; disabling keeps it so printed posters revive on re-enable.
        onlineBookingToken: profile.token ?? (enabled ? newToken() : null),
        updatedAt: new Date(),
      })
      .where(eq(organizationProfile.tenantId, tenantId));
  });
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: enabled ? 'booking.enabled' : 'booking.disabled',
    severity: 'notice',
    resourceType: 'organization_profile',
    metadata: {},
  });
  return getBookingSettings(tenantId);
}

export async function regenerateBookingToken(
  tenantId: string,
  actorUserId?: string,
): Promise<BookingSettings> {
  await ensureProfile(tenantId);
  await runWithTenant(tenantId, (tx) =>
    tx
      .update(organizationProfile)
      .set({ onlineBookingToken: newToken(), updatedAt: new Date() })
      .where(eq(organizationProfile.tenantId, tenantId)),
  );
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'booking.token.regenerated',
    severity: 'notice',
    resourceType: 'organization_profile',
    metadata: {},
  });
  return getBookingSettings(tenantId);
}
