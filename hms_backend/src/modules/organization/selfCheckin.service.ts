import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db } from '../../db/client';
import { runWithTenant } from '../../db/tenantContext';
import {
  selfCheckinRequests,
  organizationProfile,
  tenants,
  patients,
  appointments,
  providers,
  departments,
  visits,
} from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';
import { checkIn } from '../opd/opd.service';

/**
 * Patient self check-in (ADR-118) — the ADR-056 pattern applied a third time, and held to it.
 *
 * **A submission is an announcement, not a check-in.** A visit carries a queue token, opens an
 * invoice and is what a consultation hangs off; it is a clinical record, and ADR-056 is explicit
 * that no public path writes one. So the patient announces arrival and the front desk confirms —
 * which is also the identity check, because the desk is looking at the person.
 *
 * Three rules from ADR-056 that shape every function here:
 *
 * 1. **The tenant comes from an opaque token in the path.** Never a body, header, query parameter
 *    or subdomain.
 * 2. **Unknown, retired and disabled are indistinguishable.** So are "matched an appointment" and
 *    "matched nothing" — see `announceArrival`, where that costs more than it looks.
 * 3. **Audited against the tenant with no actor**, because there is no actor.
 */

function newToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Last ten digits — the same leniency the phone field applies, so a typed +91 still matches. */
function phoneKey(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

export type PublicCheckinContext = {
  hospitalName: string;
  city: string | null;
  enabled: boolean;
};

/**
 * Uniform-failure token resolution, identical in contract to registration and booking: a typo, a
 * retired token and a suspended hospital all produce the same 404.
 */
export async function resolveCheckinToken(
  token: string,
): Promise<{ tenantId: string; ctx: PublicCheckinContext }> {
  if (!token || token.length < 16) throw Errors.notFound('That check-in link is not valid');

  const rows = await db
    .select({
      tenantId: organizationProfile.tenantId,
      enabled: organizationProfile.selfCheckinEnabled,
      city: organizationProfile.city,
      displayName: organizationProfile.displayName,
      tenantName: tenants.name,
      tenantStatus: tenants.status,
    })
    .from(organizationProfile)
    .innerJoin(tenants, eq(tenants.id, organizationProfile.tenantId))
    .where(eq(organizationProfile.selfCheckinToken, token))
    .limit(1);

  const row = rows[0];
  if (!row || row.tenantStatus !== 'active')
    throw Errors.notFound('That check-in link is not valid');

  return {
    tenantId: row.tenantId,
    ctx: {
      hospitalName: row.displayName ?? row.tenantName,
      city: row.city,
      enabled: row.enabled,
    },
  };
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * A patient says they have arrived.
 *
 * **The response never varies.** Matched, unmatched, wrong hospital, no appointment today — the
 * caller is told the same thing. That is not politeness: a response that differed would turn this
 * endpoint into an oracle answering "is this mobile number a patient here, and are they due in
 * today?" for anyone with the QR code, which is a disclosure about a named person's medical
 * attendance.
 *
 * For the same reason an announcement that matched **nothing** is still recorded. An endpoint that
 * only wrote rows on a match would leak the same fact through its own side effects — and the desk
 * genuinely wants to see "somebody tried to check in and we could not find them", because that is a
 * person standing in the lobby.
 */
export async function announceArrival(
  tenantId: string,
  input: { phone: string; enabled: boolean },
  meta: { ip?: string; userAgent?: string } = {},
): Promise<void> {
  // A disabled hospital behaves exactly like an unmatched number: nothing is written, and the
  // caller is told the same thing the caller is always told.
  if (!input.enabled) {
    await writeAudit({
      tenantId,
      action: 'self_checkin.announced.disabled',
      resourceType: 'self_checkin_request',
      severity: 'info',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return;
  }

  const key = phoneKey(input.phone);

  const matched = await runWithTenant(tenantId, async (tx) => {
    if (key.length !== 10) return null;

    // Today's booked appointments for a patient with this number. The hospital has already
    // decided this person is expected — the announcement only says they have turned up.
    const rows = await tx
      .select({
        appointmentId: appointments.id,
        patientId: appointments.patientId,
        scheduledAt: appointments.scheduledAt,
      })
      .from(appointments)
      .innerJoin(patients, eq(patients.id, appointments.patientId))
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          eq(appointments.status, 'booked'),
          gte(appointments.scheduledAt, startOfToday()),
          lte(appointments.scheduledAt, endOfToday()),
          sql`right(regexp_replace(coalesce(${patients.phone}, ''), '[^0-9]', '', 'g'), 10) = ${key}`,
          eq(patients.status, 'active'),
        ),
      )
      .orderBy(asc(appointments.scheduledAt))
      .limit(1);
    return rows[0] ?? null;
  });

  const created = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .insert(selfCheckinRequests)
      .values({
        tenantId,
        appointmentId: matched?.appointmentId ?? null,
        patientId: matched?.patientId ?? null,
        claimedPhone: input.phone.slice(0, 32),
      })
      .returning({ id: selfCheckinRequests.id });
    return rows[0]!;
  });

  await writeAudit({
    tenantId,
    // No actor: there is nobody signed in, and pretending otherwise would put a fabricated name
    // against a public action.
    action: 'self_checkin.announced',
    resourceType: 'self_checkin_request',
    resourceId: created.id,
    severity: 'info',
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { matched: Boolean(matched) },
  });
}

export interface SelfCheckinRequestDto {
  id: string;
  status: string;
  claimedPhone: string;
  announcedAt: string;
  patientId: string | null;
  patientName: string | null;
  patientUhid: string | null;
  appointmentId: string | null;
  scheduledAt: string | null;
  providerName: string | null;
  departmentName: string | null;
  resultingVisitId: string | null;
  confirmedAt: string | null;
  dismissReason: string | null;
  version: number;
  /** True when a visit already exists for the matched appointment — the desk beat the patient to it. */
  alreadyCheckedIn: boolean;
}

export async function listArrivals(
  tenantId: string,
  opts: { status?: string } = {},
): Promise<SelfCheckinRequestDto[]> {
  return runWithTenant(tenantId, async (tx) => {
    const conds = [
      eq(selfCheckinRequests.tenantId, tenantId),
      gte(selfCheckinRequests.announcedAt, startOfToday()),
    ];
    if (opts.status) conds.push(eq(selfCheckinRequests.status, opts.status));

    const rows = await tx
      .select({
        r: selfCheckinRequests,
        patientFirst: patients.firstName,
        patientLast: patients.lastName,
        patientUhid: patients.uhid,
        scheduledAt: appointments.scheduledAt,
        appointmentStatus: appointments.status,
        providerName: providers.fullName,
        departmentName: departments.name,
      })
      .from(selfCheckinRequests)
      .leftJoin(patients, eq(patients.id, selfCheckinRequests.patientId))
      .leftJoin(appointments, eq(appointments.id, selfCheckinRequests.appointmentId))
      .leftJoin(providers, eq(providers.id, appointments.providerId))
      .leftJoin(departments, eq(departments.id, appointments.departmentId))
      .where(and(...conds))
      .orderBy(asc(selfCheckinRequests.announcedAt));

    // A visit may already exist — the desk checked them in by hand while they were queuing at the
    // kiosk. Saying so turns a confusing double entry into an obvious one-click dismissal.
    const appointmentIds = rows
      .map((r) => r.r.appointmentId)
      .filter((id): id is string => Boolean(id));
    const checkedIn = new Set<string>();
    if (appointmentIds.length > 0) {
      const existing = await tx
        .select({ appointmentId: visits.appointmentId })
        .from(visits)
        .where(and(eq(visits.tenantId, tenantId), inArray(visits.appointmentId, appointmentIds)));
      for (const v of existing) if (v.appointmentId) checkedIn.add(v.appointmentId);
    }

    return rows.map((row) => ({
      id: row.r.id,
      status: row.r.status,
      claimedPhone: row.r.claimedPhone,
      announcedAt: row.r.announcedAt.toISOString(),
      patientId: row.r.patientId,
      patientName: row.patientFirst ? `${row.patientFirst} ${row.patientLast ?? ''}`.trim() : null,
      patientUhid: row.patientUhid,
      appointmentId: row.r.appointmentId,
      scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
      providerName: row.providerName,
      departmentName: row.departmentName,
      resultingVisitId: row.r.resultingVisitId,
      confirmedAt: row.r.confirmedAt ? row.r.confirmedAt.toISOString() : null,
      dismissReason: row.r.dismissReason,
      version: row.r.version,
      alreadyCheckedIn: row.r.appointmentId ? checkedIn.has(row.r.appointmentId) : false,
    }));
  });
}

/**
 * The desk confirms an announcement, which is what actually checks the patient in.
 *
 * Goes through the ordinary `checkIn` — the same fee schedule, the same case rules, the same
 * invoice, the same audit. There is deliberately no second check-in implementation for this path:
 * a public surface that produced visits by a different route is how the two would diverge.
 */
export async function confirmArrival(
  tenantId: string,
  requestId: string,
  input: { version: number; canOverrideFee?: boolean },
  actorUserId?: string,
): Promise<SelfCheckinRequestDto> {
  const row = await runWithTenant(
    tenantId,
    async (tx) =>
      (
        await tx
          .select()
          .from(selfCheckinRequests)
          .where(
            and(eq(selfCheckinRequests.tenantId, tenantId), eq(selfCheckinRequests.id, requestId)),
          )
          .limit(1)
      )[0],
  );
  if (!row) throw Errors.notFound('That arrival is not on the board');
  if (row.status !== 'pending') throw Errors.conflict('That arrival has already been dealt with');
  if (!row.patientId || !row.appointmentId) {
    throw Errors.validation(
      undefined,
      'This arrival was not matched to an appointment. Check the patient in from the check-in screen instead',
    );
  }

  const visit = await checkIn(
    tenantId,
    {
      patientId: row.patientId,
      appointmentId: row.appointmentId,
      canOverrideFee: input.canOverrideFee,
    },
    actorUserId,
  );

  await runWithTenant(tenantId, async (tx) => {
    const bumped = await tx
      .update(selfCheckinRequests)
      .set({
        status: 'confirmed',
        resultingVisitId: visit.id,
        confirmedBy: actorUserId ?? null,
        confirmedAt: new Date(),
        version: row.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(selfCheckinRequests.tenantId, tenantId),
          eq(selfCheckinRequests.id, requestId),
          eq(selfCheckinRequests.version, input.version),
        ),
      )
      .returning({ id: selfCheckinRequests.id });
    if (!bumped[0])
      throw Errors.conflict('That arrival was changed by someone else. Reload and try again');
  });

  await writeAudit({
    tenantId,
    actorUserId,
    action: 'self_checkin.confirmed',
    resourceType: 'self_checkin_request',
    resourceId: requestId,
    metadata: { visitId: visit.id, patientId: row.patientId, appointmentId: row.appointmentId },
  });

  const all = await listArrivals(tenantId);
  return all.find((r) => r.id === requestId)!;
}

/** Nobody came to the counter, or they were checked in by hand. Kept, never deleted. */
export async function dismissArrival(
  tenantId: string,
  requestId: string,
  input: { version: number; reason: string },
  actorUserId?: string,
): Promise<SelfCheckinRequestDto> {
  await runWithTenant(tenantId, async (tx) => {
    const bumped = await tx
      .update(selfCheckinRequests)
      .set({
        status: 'dismissed',
        dismissReason: input.reason.trim(),
        confirmedBy: actorUserId ?? null,
        confirmedAt: new Date(),
        version: sql`${selfCheckinRequests.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(selfCheckinRequests.tenantId, tenantId),
          eq(selfCheckinRequests.id, requestId),
          eq(selfCheckinRequests.status, 'pending'),
          eq(selfCheckinRequests.version, input.version),
        ),
      )
      .returning({ id: selfCheckinRequests.id });
    if (!bumped[0])
      throw Errors.conflict('That arrival has already been dealt with, or was changed elsewhere');
  });

  await writeAudit({
    tenantId,
    actorUserId,
    action: 'self_checkin.dismissed',
    resourceType: 'self_checkin_request',
    resourceId: requestId,
    metadata: { reason: input.reason },
  });

  const all = await listArrivals(tenantId);
  return all.find((r) => r.id === requestId)!;
}

// ---- Hospital configuration -------------------------------------------------

/** `pendingCount` is how many people are waiting on the board right now — the number an
 * administrator actually wants beside the toggle. */
export type SelfCheckinSettings = { enabled: boolean; token: string | null; pendingCount: number };

/**
 * A tenant has no `organization_profile` row until somebody fills in the hospital's details, and
 * turning self check-in on must not depend on whether they have. Same guard the registration and
 * booking surfaces use.
 */
async function ensureProfile(tenantId: string): Promise<void> {
  await runWithTenant(tenantId, (tx) =>
    tx.insert(organizationProfile).values({ tenantId }).onConflictDoNothing(),
  );
}

export async function getSettings(tenantId: string): Promise<SelfCheckinSettings> {
  return runWithTenant(tenantId, async (tx) => {
    const row = (
      await tx
        .select({
          enabled: organizationProfile.selfCheckinEnabled,
          token: organizationProfile.selfCheckinToken,
        })
        .from(organizationProfile)
        .where(eq(organizationProfile.tenantId, tenantId))
        .limit(1)
    )[0];
    const pending = (
      await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(selfCheckinRequests)
        .where(
          and(
            eq(selfCheckinRequests.tenantId, tenantId),
            eq(selfCheckinRequests.status, 'pending'),
            gte(selfCheckinRequests.announcedAt, startOfToday()),
          ),
        )
    )[0];
    return {
      enabled: row?.enabled ?? false,
      token: row?.token ?? null,
      pendingCount: Number(pending?.c ?? 0),
    };
  });
}

/** Turning it on mints a token if there is none — a switch with no link behind it does nothing. */
export async function setEnabled(
  tenantId: string,
  enabled: boolean,
  actorUserId?: string,
): Promise<SelfCheckinSettings> {
  await ensureProfile(tenantId);
  await runWithTenant(tenantId, async (tx) => {
    const current = (
      await tx
        .select({ token: organizationProfile.selfCheckinToken })
        .from(organizationProfile)
        .where(eq(organizationProfile.tenantId, tenantId))
        .limit(1)
    )[0];
    await tx
      .update(organizationProfile)
      .set({
        selfCheckinEnabled: enabled,
        selfCheckinToken: current?.token ?? (enabled ? newToken() : null),
        updatedAt: new Date(),
      })
      .where(eq(organizationProfile.tenantId, tenantId));
  });

  await writeAudit({
    tenantId,
    actorUserId,
    action: enabled ? 'self_checkin.enabled' : 'self_checkin.disabled',
    resourceType: 'organization_profile',
    resourceId: tenantId,
  });
  return getSettings(tenantId);
}

/**
 * Mints a new token, which is the only way to retire a poster that has been photographed, altered
 * or put up somewhere it should not be. The old link stops working immediately.
 */
export async function regenerateToken(
  tenantId: string,
  actorUserId?: string,
): Promise<SelfCheckinSettings> {
  await ensureProfile(tenantId);
  await runWithTenant(tenantId, (tx) =>
    tx
      .update(organizationProfile)
      .set({ selfCheckinToken: newToken(), updatedAt: new Date() })
      .where(eq(organizationProfile.tenantId, tenantId)),
  );
  await writeAudit({
    tenantId,
    actorUserId,
    action: 'self_checkin.token_regenerated',
    resourceType: 'organization_profile',
    resourceId: tenantId,
    severity: 'warning',
  });
  return getSettings(tenantId);
}
