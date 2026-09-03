import { and, desc, eq } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { patientImmunizations, patients } from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';

// Patient immunisations (ADR-072 consumer). Snapshots the vaccine given so a later catalogue rename
// never rewrites a patient's record. Tenant-scoped through runWithTenant (RLS).

export interface ImmunizationInput {
  vaccineCode: string;
  vaccineName: string;
  source?: 'system' | 'custom';
  dateGiven: string; // YYYY-MM-DD
  doseLabel?: string | null;
  notes?: string | null;
}

function toDto(r: typeof patientImmunizations.$inferSelect) {
  return {
    id: r.id,
    vaccineCode: r.vaccineCode,
    vaccineName: r.vaccineName,
    source: r.source,
    dateGiven: r.dateGiven,
    doseLabel: r.doseLabel,
    notes: r.notes,
    createdAt: r.createdAt,
  };
}

export async function listImmunizations(tenantId: string, patientId: string) {
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(patientImmunizations)
      .where(
        and(
          eq(patientImmunizations.tenantId, tenantId),
          eq(patientImmunizations.patientId, patientId),
        ),
      )
      .orderBy(desc(patientImmunizations.dateGiven), desc(patientImmunizations.createdAt));
    return rows.map(toDto);
  });
}

export async function addImmunization(
  tenantId: string,
  patientId: string,
  input: ImmunizationInput,
  actorUserId?: string,
) {
  const row = await runWithTenant(tenantId, async (tx) => {
    const p = (
      await tx
        .select({ id: patients.id })
        .from(patients)
        .where(and(eq(patients.tenantId, tenantId), eq(patients.id, patientId)))
        .limit(1)
    )[0];
    if (!p) throw Errors.notFound('Patient not found');
    return (
      await tx
        .insert(patientImmunizations)
        .values({
          tenantId,
          patientId,
          vaccineCode: input.vaccineCode,
          vaccineName: input.vaccineName,
          source: input.source === 'custom' ? 'custom' : 'system',
          dateGiven: input.dateGiven,
          doseLabel: input.doseLabel ?? null,
          notes: input.notes ?? null,
          recordedByUserId: actorUserId ?? null,
        })
        .returning()
    )[0]!;
  });
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'immunization.record',
    resourceType: 'patient_immunization',
    resourceId: row.id,
    metadata: { patientId, vaccineCode: row.vaccineCode },
  });
  return toDto(row);
}
