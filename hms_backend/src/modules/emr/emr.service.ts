import { and, eq } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import {
  encounters,
  diagnoses,
  prescriptions,
  labOrders,
  visits,
  patients,
  providers,
  type Encounter as EncounterRow,
} from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';
import { eventBus } from '../../events/eventBus';

export { searchIcd10 } from './icd10.data';

// Clinical Workflow / EMR (development-plan §12). One encounter per visit, saved whole while
// draft, then signed to lock. Vitals are stored as integer units and converted at the edge.

export interface VitalsInput {
  systolic?: number | null;
  diastolic?: number | null;
  pulse?: number | null;
  spo2?: number | null;
  respRate?: number | null;
  tempC?: number | null;
  weightKg?: number | null;
  heightCm?: number | null;
}

export interface SaveEncounterInput {
  version: number;
  chiefComplaint?: string | null;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  vitals?: VitalsInput;
  diagnoses: Array<{ icd10Code: string; icd10Term: string; isPrimary?: boolean; notes?: string | null }>;
  prescriptions: Array<{
    drugName: string;
    dose?: string | null;
    frequency?: string | null;
    duration?: string | null;
    route?: string | null;
    instructions?: string | null;
  }>;
  labOrders: Array<{ testName: string; testCode?: string | null; priority?: string | null; notes?: string | null }>;
}

const round = (n: number | null | undefined): number | null =>
  n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n);

function vitalsToStore(v: VitalsInput | undefined) {
  return {
    vitalSystolic: round(v?.systolic),
    vitalDiastolic: round(v?.diastolic),
    vitalPulse: round(v?.pulse),
    vitalSpo2: round(v?.spo2),
    vitalRespRate: round(v?.respRate),
    vitalTempCTenths: v?.tempC === null || v?.tempC === undefined ? null : Math.round(v.tempC * 10),
    vitalWeightG: v?.weightKg === null || v?.weightKg === undefined ? null : Math.round(v.weightKg * 1000),
    vitalHeightCm: round(v?.heightCm),
  };
}

async function buildDto(tenantId: string, encounterId: string) {
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        e: encounters,
        patientFirst: patients.firstName,
        patientLast: patients.lastName,
        patientUhid: patients.uhid,
        providerName: providers.fullName,
      })
      .from(encounters)
      .innerJoin(patients, eq(patients.id, encounters.patientId))
      .leftJoin(providers, eq(providers.id, encounters.providerId))
      .where(and(eq(encounters.tenantId, tenantId), eq(encounters.id, encounterId)))
      .limit(1);
    const row = rows[0];
    if (!row) throw Errors.notFound('Encounter not found');
    const e = row.e;

    const [dx, rx, lab] = await Promise.all([
      tx.select().from(diagnoses).where(eq(diagnoses.encounterId, encounterId)).orderBy(diagnoses.createdAt),
      tx.select().from(prescriptions).where(eq(prescriptions.encounterId, encounterId)).orderBy(prescriptions.createdAt),
      tx.select().from(labOrders).where(eq(labOrders.encounterId, encounterId)).orderBy(labOrders.createdAt),
    ]);

    return {
      id: e.id,
      visitId: e.visitId,
      patientId: e.patientId,
      patientName: `${row.patientFirst} ${row.patientLast ?? ''}`.trim(),
      patientUhid: row.patientUhid,
      providerId: e.providerId,
      providerName: row.providerName,
      status: e.status,
      version: e.version,
      signedAt: e.signedAt ? e.signedAt.toISOString() : null,
      chiefComplaint: e.chiefComplaint,
      subjective: e.subjective,
      objective: e.objective,
      assessment: e.assessment,
      plan: e.plan,
      vitals: {
        systolic: e.vitalSystolic,
        diastolic: e.vitalDiastolic,
        pulse: e.vitalPulse,
        spo2: e.vitalSpo2,
        respRate: e.vitalRespRate,
        tempC: e.vitalTempCTenths === null ? null : e.vitalTempCTenths / 10,
        weightKg: e.vitalWeightG === null ? null : e.vitalWeightG / 1000,
        heightCm: e.vitalHeightCm,
      },
      diagnoses: dx.map((d) => ({ id: d.id, icd10Code: d.icd10Code, icd10Term: d.icd10Term, isPrimary: d.isPrimary, notes: d.notes })),
      prescriptions: rx.map((p) => ({
        id: p.id,
        drugName: p.drugName,
        dose: p.dose,
        frequency: p.frequency,
        duration: p.duration,
        route: p.route,
        instructions: p.instructions,
        status: p.status,
      })),
      labOrders: lab.map((l) => ({
        id: l.id,
        testName: l.testName,
        testCode: l.testCode,
        priority: l.priority,
        status: l.status,
        notes: l.notes,
      })),
    };
  });
}

// The doctor opens a consultation: return the visit's encounter, creating a draft if none exists.
export async function getEncounterByVisit(tenantId: string, visitId: string, actorUserId?: string) {
  const encounterId = await runWithTenant(tenantId, async (tx) => {
    const visit = (
      await tx.select().from(visits).where(and(eq(visits.tenantId, tenantId), eq(visits.id, visitId))).limit(1)
    )[0];
    if (!visit) throw Errors.notFound('Visit not found');

    const existing = (
      await tx.select({ id: encounters.id }).from(encounters).where(and(eq(encounters.tenantId, tenantId), eq(encounters.visitId, visitId))).limit(1)
    )[0];
    if (existing) return existing.id;

    const created = (
      await tx
        .insert(encounters)
        .values({
          tenantId,
          visitId,
          patientId: visit.patientId,
          providerId: visit.providerId,
          authoredBy: actorUserId ?? null,
        })
        .onConflictDoNothing()
        .returning({ id: encounters.id })
    )[0];
    if (created) return created.id;
    // lost a race — fetch the row the other request created
    const row = (
      await tx.select({ id: encounters.id }).from(encounters).where(and(eq(encounters.tenantId, tenantId), eq(encounters.visitId, visitId))).limit(1)
    )[0];
    if (!row) throw Errors.conflict('Could not open the encounter — please retry');
    return row.id;
  });
  return buildDto(tenantId, encounterId);
}

export async function saveEncounter(tenantId: string, encounterId: string, input: SaveEncounterInput, actorUserId?: string) {
  await runWithTenant(tenantId, async (tx) => {
    const e = (
      await tx.select().from(encounters).where(and(eq(encounters.tenantId, tenantId), eq(encounters.id, encounterId))).limit(1)
    )[0];
    if (!e) throw Errors.notFound('Encounter not found');
    if (e.status === 'signed') throw Errors.conflict('A signed encounter cannot be edited');
    if (e.authoredBy && actorUserId && e.authoredBy !== actorUserId) {
      throw Errors.forbidden("You cannot edit another clinician's notes");
    }
    if (e.version !== input.version) throw Errors.conflict('This encounter was updated elsewhere — please refresh');

    await tx
      .update(encounters)
      .set({
        chiefComplaint: input.chiefComplaint ?? null,
        subjective: input.subjective ?? null,
        objective: input.objective ?? null,
        assessment: input.assessment ?? null,
        plan: input.plan ?? null,
        ...vitalsToStore(input.vitals),
        version: e.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(encounters.id, encounterId));

    // Replace the collections (safe while draft — nothing downstream has consumed them yet).
    await tx.delete(diagnoses).where(eq(diagnoses.encounterId, encounterId));
    await tx.delete(prescriptions).where(eq(prescriptions.encounterId, encounterId));
    await tx.delete(labOrders).where(eq(labOrders.encounterId, encounterId));

    if (input.diagnoses.length > 0) {
      await tx.insert(diagnoses).values(
        input.diagnoses.map((d) => ({
          tenantId,
          encounterId,
          icd10Code: d.icd10Code,
          icd10Term: d.icd10Term,
          isPrimary: d.isPrimary ?? false,
          notes: d.notes ?? null,
        })),
      );
    }
    if (input.prescriptions.length > 0) {
      await tx.insert(prescriptions).values(
        input.prescriptions.map((p) => ({
          tenantId,
          encounterId,
          visitId: e.visitId,
          patientId: e.patientId,
          drugName: p.drugName,
          dose: p.dose ?? null,
          frequency: p.frequency ?? null,
          duration: p.duration ?? null,
          route: p.route ?? null,
          instructions: p.instructions ?? null,
          prescribedBy: actorUserId ?? null,
        })),
      );
    }
    if (input.labOrders.length > 0) {
      await tx.insert(labOrders).values(
        input.labOrders.map((l) => ({
          tenantId,
          encounterId,
          visitId: e.visitId,
          patientId: e.patientId,
          testName: l.testName,
          testCode: l.testCode ?? null,
          priority: l.priority ?? 'routine',
          notes: l.notes ?? null,
          orderedBy: actorUserId ?? null,
        })),
      );
    }
  });

  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'encounter.save',
    resourceType: 'encounter',
    resourceId: encounterId,
    metadata: { diagnoses: input.diagnoses.length, prescriptions: input.prescriptions.length, labOrders: input.labOrders.length },
  });
  return buildDto(tenantId, encounterId);
}

export async function signEncounter(tenantId: string, encounterId: string, actorUserId?: string) {
  const visitId = await runWithTenant(tenantId, async (tx) => {
    const e = (
      await tx.select().from(encounters).where(and(eq(encounters.tenantId, tenantId), eq(encounters.id, encounterId))).limit(1)
    )[0];
    if (!e) throw Errors.notFound('Encounter not found');
    if (e.status === 'signed') throw Errors.conflict('Encounter is already signed');
    if (e.authoredBy && actorUserId && e.authoredBy !== actorUserId) {
      throw Errors.forbidden("You cannot sign another clinician's encounter");
    }
    await tx
      .update(encounters)
      .set({ status: 'signed', signedAt: new Date(), version: e.version + 1, updatedAt: new Date() })
      .where(eq(encounters.id, encounterId));
    // Signing the consultation completes the visit.
    await tx.update(visits).set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() }).where(eq(visits.id, e.visitId));
    return e.visitId;
  });

  eventBus.publish('encounter.signed', { tenantId, encounterId, visitId });
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'encounter.sign',
    resourceType: 'encounter',
    resourceId: encounterId,
    metadata: { visitId },
  });
  return buildDto(tenantId, encounterId);
}
