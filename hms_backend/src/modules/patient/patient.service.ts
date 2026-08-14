import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { patients, type Patient } from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';

export type PatientInput = {
  firstName: string;
  lastName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  phone?: string | null;
  email?: string | null;
  bloodGroup?: string | null;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  abhaNumber?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  branchId?: string | null;
};

// Allocates a per-tenant UHID (`UHID-000001`, …) and inserts. The unique (tenant, uhid) constraint
// guards against a race: on conflict we retry the next number. Core clinical entity — strongly typed.
export async function createPatient(
  tenantId: string,
  data: PatientInput,
  actorUserId?: string,
): Promise<Patient> {
  const patient = await runWithTenant(tenantId, async (tx) => {
    const existing = Number(
      (await tx.select({ c: count() }).from(patients).where(eq(patients.tenantId, tenantId)))[0]?.c ?? 0,
    );
    for (let i = 1; i <= 8; i++) {
      const uhid = `UHID-${String(existing + i).padStart(6, '0')}`;
      const rows = await tx
        .insert(patients)
        .values({
          tenantId,
          uhid,
          firstName: data.firstName,
          lastName: data.lastName ?? null,
          gender: data.gender ?? null,
          dateOfBirth: data.dateOfBirth ?? null,
          phone: data.phone ?? null,
          email: data.email ?? null,
          bloodGroup: data.bloodGroup ?? null,
          addressLine: data.addressLine ?? null,
          city: data.city ?? null,
          state: data.state ?? null,
          pincode: data.pincode ?? null,
          abhaNumber: data.abhaNumber ?? null,
          emergencyContactName: data.emergencyContactName ?? null,
          emergencyContactPhone: data.emergencyContactPhone ?? null,
          branchId: data.branchId ?? null,
          createdBy: actorUserId ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (rows[0]) return rows[0];
    }
    throw Errors.conflict('Could not allocate a UHID — please retry');
  });
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'patient.create',
    resourceType: 'patient',
    resourceId: patient.id,
    metadata: { uhid: patient.uhid },
  });
  return patient;
}

export async function getPatient(tenantId: string, id: string): Promise<Patient | null> {
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(patients)
      .where(and(eq(patients.tenantId, tenantId), eq(patients.id, id)))
      .limit(1);
    return rows[0] ?? null;
  });
}

export async function listPatients(
  tenantId: string,
  opts: { page: number; pageSize: number; search?: string },
): Promise<{ rows: Patient[]; total: number }> {
  const term = opts.search?.trim();
  return runWithTenant(tenantId, async (tx) => {
    const base = eq(patients.tenantId, tenantId);
    const where = term
      ? and(
          base,
          or(
            ilike(patients.uhid, `%${term}%`),
            ilike(patients.firstName, `%${term}%`),
            ilike(patients.lastName, `%${term}%`),
            ilike(patients.phone, `%${term}%`),
          ),
        )
      : base;
    const rows = await tx
      .select()
      .from(patients)
      .where(where)
      .orderBy(desc(patients.createdAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize);
    const total = Number(
      (await tx.select({ c: count() }).from(patients).where(where))[0]?.c ?? 0,
    );
    return { rows, total };
  });
}

export async function updatePatient(
  tenantId: string,
  id: string,
  patch: Partial<PatientInput> & { status?: string },
  actorUserId?: string,
): Promise<Patient> {
  // Only set provided keys (map camelCase → columns); ignore undefined.
  const set: Record<string, unknown> = { updatedAt: new Date() };
  const fields: Array<keyof PatientInput | 'status'> = [
    'firstName', 'lastName', 'gender', 'dateOfBirth', 'phone', 'email', 'bloodGroup',
    'addressLine', 'city', 'state', 'pincode', 'abhaNumber', 'emergencyContactName',
    'emergencyContactPhone', 'branchId', 'status',
  ];
  for (const f of fields) {
    if ((patch as Record<string, unknown>)[f] !== undefined) set[f] = (patch as Record<string, unknown>)[f];
  }
  const updated = (
    await runWithTenant(tenantId, (tx) =>
      tx
        .update(patients)
        .set(set)
        .where(and(eq(patients.tenantId, tenantId), eq(patients.id, id)))
        .returning(),
    )
  )[0];
  if (!updated) throw Errors.notFound('Patient not found');
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'patient.update',
    resourceType: 'patient',
    resourceId: id,
    metadata: { fields: Object.keys(set).filter((k) => k !== 'updatedAt') },
  });
  return updated;
}

// Count for the dashboard tiles (tenant-scoped).
export async function countPatients(tenantId: string): Promise<number> {
  return runWithTenant(tenantId, async (tx) => {
    const c = (await tx.select({ c: count() }).from(patients).where(eq(patients.tenantId, tenantId)))[0];
    return Number(c?.c ?? 0);
  });
}
