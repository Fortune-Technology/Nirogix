import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { runWithTenant } from '../../db/tenantContext';
import {
  providers,
  specialties,
  practitionerRoles,
  specialtyFormTemplates,
  type Provider,
  type PractitionerRole,
  type Specialty,
  type SpecialtyFormTemplate,
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

// FHIR PractitionerRole: attach a specialty (+ optional branch/role) to a provider — a data change,
// not a schema change. Returns null if the provider doesn't exist in this tenant.
export async function assignSpecialty(
  tenantId: string,
  providerId: string,
  data: { specialtyCode: string; branchId?: string; role?: string; isPrimary?: boolean },
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
    const rows = await tx
      .insert(practitionerRoles)
      .values({
        tenantId,
        providerId,
        specialtyCode: data.specialtyCode,
        branchId: data.branchId ?? null,
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
