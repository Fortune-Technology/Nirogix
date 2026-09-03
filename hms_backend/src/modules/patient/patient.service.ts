import { and, count, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { patients, type Patient } from '../../db/schema';
import { AppError, Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';
import { eventBus } from '../../events/eventBus';

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
  /** Register anyway after the duplicate warning was reviewed (never a silent default). */
  allowDuplicate?: boolean;
};

/**
 * Likely-duplicate lookup: same phone number AND (same name, case-insensitive, or same date of
 * birth). Loose enough to catch the family-shared-phone re-registration, tight enough that a
 * spouse on the same number with a different name and DOB registers cleanly.
 */
async function findDuplicateCandidates(
  tenantId: string,
  data: Pick<PatientInput, 'phone' | 'firstName' | 'lastName' | 'dateOfBirth'>,
): Promise<Patient[]> {
  const phone = data.phone?.trim();
  if (!phone) return [];
  return runWithTenant(tenantId, async (tx) => {
    const sameName = and(
      sql`lower(${patients.firstName}) = lower(${data.firstName.trim()})`,
      data.lastName?.trim()
        ? sql`lower(coalesce(${patients.lastName}, '')) = lower(${data.lastName.trim()})`
        : sql`coalesce(${patients.lastName}, '') = ''`,
    );
    const conds = [
      eq(patients.tenantId, tenantId),
      eq(patients.status, 'active'),
      eq(patients.phone, phone),
      data.dateOfBirth ? or(sameName, eq(patients.dateOfBirth, data.dateOfBirth)) : sameName,
    ];
    return tx
      .select()
      .from(patients)
      .where(and(...conds))
      .limit(5);
  });
}

// Allocates a per-tenant UHID (`UHID-000001`, …) and inserts. The unique (tenant, uhid) constraint
// guards against a race: on conflict we retry the next number. Core clinical entity — strongly typed.
export async function createPatient(
  tenantId: string,
  data: PatientInput,
  actorUserId?: string,
): Promise<Patient> {
  // Duplicate guard: registration stops with the matching charts unless the caller explicitly
  // reviewed them and chose to register anyway ("search and select, don't re-create").
  if (!data.allowDuplicate) {
    const candidates = await findDuplicateCandidates(tenantId, data);
    if (candidates.length > 0) {
      throw new AppError(409, 'DUPLICATE_PATIENT', 'A patient with these details already exists', {
        candidates: candidates.map((c) => ({
          id: c.id,
          uhid: c.uhid,
          firstName: c.firstName,
          lastName: c.lastName,
          phone: c.phone,
          dateOfBirth: c.dateOfBirth,
          gender: c.gender,
        })),
      });
    }
  }

  const patient = await runWithTenant(tenantId, async (tx) => {
    // Serialize UHID allocation per tenant; the unique-conflict retry loop stays as the backstop.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${tenantId}:uhid`}))`);
    const existing = Number(
      (await tx.select({ c: count() }).from(patients).where(eq(patients.tenantId, tenantId)))[0]
        ?.c ?? 0,
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
        // Scoped to the UHID constraint on purpose. An unqualified `onConflictDoNothing()` swallows
        // EVERY unique violation, so a duplicate ABHA number (ADR-100) would be silently retried as
        // though it were a UHID collision and then reported as "could not allocate a UHID" — the
        // wrong cause, and one a receptionist could never act on.
        .onConflictDoNothing({ target: [patients.tenantId, patients.uhid] })
        .returning();
      if (rows[0]) return rows[0];
    }
    throw Errors.conflict('Could not allocate a UHID. Please retry');
  });
  eventBus.publish('patient.registered', { tenantId, patientId: patient.id });
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
  opts: {
    page: number;
    pageSize: number;
    search?: string;
    gender?: string[];
    status?: string[];
    city?: string[];
    registeredFrom?: string;
    registeredTo?: string;
  },
): Promise<{ rows: Patient[]; total: number }> {
  const term = opts.search?.trim();
  return runWithTenant(tenantId, async (tx) => {
    // RLS already scopes to the tenant; this repeats it as a belt-and-braces WHERE.
    // Faceted filters (gender/status/city) narrow on the server now, so a selection
    // filters the whole dataset rather than the page in the browser (ADR-063).
    const conds: Array<SQL | undefined> = [eq(patients.tenantId, tenantId)];
    if (term) {
      conds.push(
        or(
          ilike(patients.uhid, `%${term}%`),
          ilike(patients.firstName, `%${term}%`),
          ilike(patients.lastName, `%${term}%`),
          ilike(patients.phone, `%${term}%`),
        ),
      );
    }
    if (opts.gender?.length) conds.push(inArray(patients.gender, opts.gender));
    if (opts.status?.length) conds.push(inArray(patients.status, opts.status));
    if (opts.city?.length) conds.push(inArray(patients.city, opts.city));
    // Registration date range (inclusive of the whole `to` day). The DateRangeFilter
    // sends ISO calendar dates; timestamps are compared against day bounds.
    if (opts.registeredFrom)
      conds.push(gte(patients.createdAt, new Date(`${opts.registeredFrom}T00:00:00.000Z`)));
    if (opts.registeredTo)
      conds.push(lte(patients.createdAt, new Date(`${opts.registeredTo}T23:59:59.999Z`)));
    const where = and(...conds);
    const rows = await tx
      .select()
      .from(patients)
      .where(where)
      .orderBy(desc(patients.createdAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize);
    const total = Number((await tx.select({ c: count() }).from(patients).where(where))[0]?.c ?? 0);
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
    'firstName',
    'lastName',
    'gender',
    'dateOfBirth',
    'phone',
    'email',
    'bloodGroup',
    'addressLine',
    'city',
    'state',
    'pincode',
    'abhaNumber',
    'emergencyContactName',
    'emergencyContactPhone',
    'branchId',
    'status',
  ];
  for (const f of fields) {
    if ((patch as Record<string, unknown>)[f] !== undefined)
      set[f] = (patch as Record<string, unknown>)[f];
  }
  // Editing the ABHA number by hand un-verifies it (ADR-084). Only a completed ABDM flow may set
  // `abhaVerifiedAt`, so a number that was proved and has since been retyped must stop claiming to
  // be proved — otherwise the verified flag would vouch for a value ABDM never saw. The linking
  // token goes with it: it belongs to the ABHA that was verified, not to whatever replaced it.
  if (patch.abhaNumber !== undefined) {
    set.abhaVerifiedAt = null;
    set.abhaSource = 'manual';
    set.abhaLinkingTokenEnc = null;
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
    const c = (
      await tx.select({ c: count() }).from(patients).where(eq(patients.tenantId, tenantId))
    )[0];
    return Number(c?.c ?? 0);
  });
}
