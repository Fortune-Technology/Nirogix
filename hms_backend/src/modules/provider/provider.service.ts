import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { runWithTenant } from '../../db/tenantContext';
import {
  providers,
  specialties,
  practitionerRoles,
  providerSchedules,
  appointments,
  departments,
  specialtyFormTemplates,
  type Provider,
  type PractitionerRole,
  type Specialty,
  type SpecialtyFormTemplate,
  type ProviderSchedule,
} from '../../db/schema';
import { SPECIALTY_CATALOG, SPECIALTY_CODES } from './specialtyCatalog';
import { writeAudit } from '../audit/audit.service';
import { Errors } from '../../http/error';

// Seeds the global specialty catalog (idempotent). `specialties` has no RLS (global reference).
export async function seedSpecialtyCatalog(): Promise<void> {
  for (const s of SPECIALTY_CATALOG) {
    await db
      .insert(specialties)
      .values({ code: s.code, name: s.name, snomedCode: s.snomedCode ?? null })
      .onConflictDoNothing();
  }
}

export async function listSpecialties(): Promise<Specialty[]> {
  return db.select().from(specialties);
}

export async function createProvider(
  tenantId: string,
  data: {
    fullName: string;
    gender?: string;
    registrationNumber?: string;
    qualification?: string;
    email?: string;
    phone?: string;
    userId?: string;
    consultationFeePaise?: number | null;
  },
  actorUserId?: string,
): Promise<Provider> {
  const provider = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .insert(providers)
      .values({
        tenantId,
        fullName: data.fullName,
        gender: data.gender ?? null,
        registrationNumber: data.registrationNumber ?? null,
        qualification: data.qualification ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        userId: data.userId ?? null,
        consultationFeePaise: data.consultationFeePaise ?? null,
      })
      .returning();
    return rows[0]!;
  });
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'provider.create',
    resourceType: 'provider',
    resourceId: provider.id,
    metadata: { fullName: data.fullName },
  });
  return provider;
}

// Edit / deactivate a provider (ADR-060 — a record that can be displayed incorrectly must have
// a permitted way to be corrected). Only provided keys change; `isActive: false` retires the
// doctor from new work without touching any clinical history.
export async function updateProvider(
  tenantId: string,
  providerId: string,
  patch: {
    fullName?: string;
    gender?: string | null;
    registrationNumber?: string | null;
    qualification?: string | null;
    email?: string | null;
    phone?: string | null;
    userId?: string | null;
    consultationFeePaise?: number | null;
    isActive?: boolean;
  },
  actorUserId?: string,
): Promise<Provider> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  const fields = [
    'fullName',
    'gender',
    'registrationNumber',
    'qualification',
    'email',
    'phone',
    'userId',
    'consultationFeePaise',
    'isActive',
  ] as const;
  for (const f of fields) {
    if ((patch as Record<string, unknown>)[f] !== undefined)
      set[f] = (patch as Record<string, unknown>)[f];
  }
  const updated = (
    await runWithTenant(tenantId, (tx) =>
      tx
        .update(providers)
        .set(set)
        .where(and(eq(providers.tenantId, tenantId), eq(providers.id, providerId)))
        .returning(),
    )
  )[0];
  if (!updated) throw Errors.notFound('Provider not found');
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'provider.update',
    resourceType: 'provider',
    resourceId: providerId,
    metadata: { fields: Object.keys(set).filter((k) => k !== 'updatedAt') },
  });
  return updated;
}

// FHIR PractitionerRole: attach a specialty (+ optional branch/role) to a provider — a data change,
// not a schema change. Returns null if the provider doesn't exist in this tenant.
export async function assignSpecialty(
  tenantId: string,
  providerId: string,
  data: {
    specialtyCode: string;
    branchId?: string;
    departmentId?: string;
    role?: string;
    isPrimary?: boolean;
  },
  actorUserId?: string,
): Promise<PractitionerRole | null> {
  if (!SPECIALTY_CODES.has(data.specialtyCode)) {
    throw Errors.validation(undefined, `Unknown specialty: ${data.specialtyCode}`);
  }
  const role = await runWithTenant(tenantId, async (tx) => {
    const prov = (
      await tx
        .select()
        .from(providers)
        .where(and(eq(providers.tenantId, tenantId), eq(providers.id, providerId)))
        .limit(1)
    )[0];
    if (!prov) return null;
    // A provider can only be assigned to this hospital's own department (ADR-050) — the check is
    // here rather than left to the foreign key so the caller gets a message, not a constraint error.
    if (data.departmentId) {
      const dept = (
        await tx
          .select({ id: departments.id, isActive: departments.isActive })
          .from(departments)
          .where(and(eq(departments.tenantId, tenantId), eq(departments.id, data.departmentId)))
          .limit(1)
      )[0];
      if (!dept)
        throw Errors.validation(undefined, 'That department does not belong to your organization');
      if (!dept.isActive) throw Errors.validation(undefined, 'That department is no longer active');
    }
    const rows = await tx
      .insert(practitionerRoles)
      .values({
        tenantId,
        providerId,
        specialtyCode: data.specialtyCode,
        branchId: data.branchId ?? null,
        departmentId: data.departmentId ?? null,
        role: data.role ?? 'consultant',
        isPrimary: data.isPrimary ?? false,
      })
      .onConflictDoNothing()
      .returning();
    return rows[0] ?? null;
  });
  if (role) {
    await writeAudit({
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'provider.specialty.assign',
      resourceType: 'provider',
      resourceId: providerId,
      metadata: { specialtyCode: data.specialtyCode },
    });
  }
  return role;
}

export type ProviderWithSpecialties = Provider & { specialties: string[] };

export async function listProvidersWithRoles(tenantId: string): Promise<ProviderWithSpecialties[]> {
  return runWithTenant(tenantId, async (tx) => {
    const provs = await tx.select().from(providers).where(eq(providers.tenantId, tenantId));
    const roles = await tx
      .select()
      .from(practitionerRoles)
      .where(eq(practitionerRoles.tenantId, tenantId));
    return provs.map((p) => ({
      ...p,
      specialties: roles
        .filter((r) => r.providerId === p.id && r.isActive)
        .map((r) => r.specialtyCode),
    }));
  });
}

export async function getProviderWithRoles(
  tenantId: string,
  id: string,
): Promise<(Provider & { roles: PractitionerRole[] }) | null> {
  return runWithTenant(tenantId, async (tx) => {
    const p = (
      await tx
        .select()
        .from(providers)
        .where(and(eq(providers.tenantId, tenantId), eq(providers.id, id)))
        .limit(1)
    )[0];
    if (!p) return null;
    const roles = await tx
      .select()
      .from(practitionerRoles)
      .where(and(eq(practitionerRoles.tenantId, tenantId), eq(practitionerRoles.providerId, id)));
    return { ...p, roles };
  });
}

// ---- Weekly roster + free slots (ADR-069, E-8) -------------------------------

export interface ScheduleWindowInput {
  weekday: number; // 0 = Sunday … 6 = Saturday
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  slotMinutes?: number;
  branchId?: string | null;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
function minutes(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export async function listSchedules(
  tenantId: string,
  providerId: string,
): Promise<ProviderSchedule[]> {
  return runWithTenant(tenantId, (tx) =>
    tx
      .select()
      .from(providerSchedules)
      .where(
        and(
          eq(providerSchedules.tenantId, tenantId),
          eq(providerSchedules.providerId, providerId),
          eq(providerSchedules.isActive, true),
        ),
      )
      .orderBy(asc(providerSchedules.weekday), asc(providerSchedules.startTime)),
  );
}

/**
 * Replace the provider's whole weekly roster — the editor works on the week as one
 * document, which is how a roster is actually thought about. Overlapping windows on
 * the same weekday are refused; an empty list clears the roster (booking becomes
 * free-form again).
 */
export async function setSchedules(
  tenantId: string,
  providerId: string,
  windows: ScheduleWindowInput[],
  actorUserId?: string,
): Promise<ProviderSchedule[]> {
  for (const w of windows) {
    if (!Number.isInteger(w.weekday) || w.weekday < 0 || w.weekday > 6)
      throw Errors.validation(undefined, 'weekday must be 0–6');
    if (!HHMM.test(w.startTime) || !HHMM.test(w.endTime))
      throw Errors.validation(undefined, 'Times must be HH:mm');
    if (minutes(w.startTime) >= minutes(w.endTime))
      throw Errors.validation(undefined, 'A window must end after it starts');
  }
  for (const a of windows) {
    for (const b of windows) {
      if (a === b || a.weekday !== b.weekday) continue;
      if (minutes(a.startTime) < minutes(b.endTime) && minutes(b.startTime) < minutes(a.endTime)) {
        throw Errors.validation(undefined, 'Windows on the same day must not overlap');
      }
    }
  }

  const rows = await runWithTenant(tenantId, async (tx) => {
    const prov = (
      await tx
        .select({ id: providers.id })
        .from(providers)
        .where(and(eq(providers.tenantId, tenantId), eq(providers.id, providerId)))
        .limit(1)
    )[0];
    if (!prov) throw Errors.notFound('Provider not found');

    await tx
      .delete(providerSchedules)
      .where(
        and(eq(providerSchedules.tenantId, tenantId), eq(providerSchedules.providerId, providerId)),
      );
    if (windows.length === 0) return [];
    return tx
      .insert(providerSchedules)
      .values(
        windows.map((w) => ({
          tenantId,
          providerId,
          weekday: w.weekday,
          startTime: w.startTime,
          endTime: w.endTime,
          slotMinutes: w.slotMinutes ?? 15,
          branchId: w.branchId ?? null,
        })),
      )
      .returning();
  });

  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'provider.schedule.set',
    resourceType: 'provider',
    resourceId: providerId,
    metadata: { windows: windows.length },
  });
  return rows;
}

/**
 * Free slots for one day: the weekday's windows cut into slot-sized starts, minus
 * anything overlapping a booked appointment. Empty when the provider has no roster —
 * the caller falls back to free-form time entry.
 */
export async function listFreeSlots(tenantId: string, providerId: string, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw Errors.validation(undefined, 'date must be YYYY-MM-DD');
  return runWithTenant(tenantId, async (tx) => {
    const weekday = new Date(`${date}T00:00:00`).getDay();
    const windows = await tx
      .select()
      .from(providerSchedules)
      .where(
        and(
          eq(providerSchedules.tenantId, tenantId),
          eq(providerSchedules.providerId, providerId),
          eq(providerSchedules.isActive, true),
          eq(providerSchedules.weekday, weekday),
        ),
      )
      .orderBy(asc(providerSchedules.startTime));
    if (windows.length === 0)
      return { hasRoster: false, slots: [] as Array<{ startsAt: string; label: string }> };

    const booked = await tx
      .select({
        scheduledAt: appointments.scheduledAt,
        durationMinutes: appointments.durationMinutes,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          eq(appointments.providerId, providerId),
          eq(appointments.status, 'booked'),
        ),
      );
    const taken = booked.map((b) => ({
      start: b.scheduledAt.getTime(),
      end: b.scheduledAt.getTime() + b.durationMinutes * 60_000,
    }));

    const now = Date.now();
    const slots: Array<{ startsAt: string; label: string }> = [];
    for (const w of windows) {
      for (
        let m = minutes(w.startTime);
        m + w.slotMinutes <= minutes(w.endTime);
        m += w.slotMinutes
      ) {
        const start = new Date(
          `${date}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`,
        );
        const end = start.getTime() + w.slotMinutes * 60_000;
        if (end <= now) continue; // the past is not bookable
        if (taken.some((t) => start.getTime() < t.end && t.start < end)) continue;
        slots.push({
          startsAt: start.toISOString(),
          label: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
        });
      }
    }
    return { hasRoster: true, slots };
  });
}

export async function createFormTemplate(
  tenantId: string,
  data: { specialtyCode?: string; key: string; name: string; schema: unknown },
  actorUserId?: string,
): Promise<SpecialtyFormTemplate> {
  const tpl = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .insert(specialtyFormTemplates)
      .values({
        tenantId,
        specialtyCode: data.specialtyCode ?? null,
        key: data.key,
        name: data.name,
        schema: data.schema,
      })
      .returning();
    return rows[0]!;
  });
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'specialty_template.create',
    resourceType: 'form_template',
    resourceId: tpl.id,
    metadata: { key: data.key, specialtyCode: data.specialtyCode ?? null },
  });
  return tpl;
}

export async function listFormTemplates(tenantId: string): Promise<SpecialtyFormTemplate[]> {
  return runWithTenant(tenantId, (tx) =>
    tx.select().from(specialtyFormTemplates).where(eq(specialtyFormTemplates.tenantId, tenantId)),
  );
}
