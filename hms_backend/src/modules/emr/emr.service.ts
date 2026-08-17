import { and, desc, eq, inArray } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import {
  encounters,
  diagnoses,
  prescriptions,
  labOrders,
  visits,
  patients,
  providers,
  appointments,
  invoices,
  drugs,
  labTests,
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
    /** Present when the row already exists — lets a re-save update in place instead of replacing. */
    id?: string | null;
    /** Drug-master link; when set, the master's name is snapshotted server-side. */
    drugId?: string | null;
    drugName: string;
    dose?: string | null;
    frequency?: string | null;
    duration?: string | null;
    route?: string | null;
    instructions?: string | null;
  }>;
  labOrders: Array<{
    id?: string | null;
    /** Test-master link; when set, name/code are snapshotted and the order is priced at collection. */
    testId?: string | null;
    testName: string;
    testCode?: string | null;
    priority?: string | null;
    notes?: string | null;
  }>;
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
        drugId: p.drugId,
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
        testId: l.testId,
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

    // Starting a NEW consultation (re-opening an existing one is always allowed):
    // the visit must be live, and the consultation fee must be settled first — payment
    // before consultation is a workflow rule, enforced here, not in the UI.
    if (visit.status === 'cancelled' || visit.status === 'completed') {
      throw Errors.conflict(`Cannot start a consultation on a ${visit.status} visit`);
    }
    if (visit.invoiceId) {
      const inv = (
        await tx
          .select({ totalPaise: invoices.totalPaise, amountPaidPaise: invoices.amountPaidPaise })
          .from(invoices)
          .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, visit.invoiceId)))
          .limit(1)
      )[0];
      if (inv && inv.totalPaise > inv.amountPaidPaise) {
        throw Errors.conflict('Consultation fee is unpaid — collect the payment before the consultation starts');
      }
    }

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

    // Compare-and-swap on the version: the predicate (not a pre-read) is what rejects a
    // concurrent save, so two tabs can never both win (lost-update safe).
    const bumped = await tx
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
      .where(and(eq(encounters.id, encounterId), eq(encounters.version, input.version)))
      .returning({ id: encounters.id });
    if (!bumped[0]) throw Errors.conflict('This encounter was updated elsewhere — please refresh');

    // Validate master-data links before writing anything that carries them.
    const rxDrugIds = [...new Set(input.prescriptions.map((p) => p.drugId).filter((x): x is string => Boolean(x)))];
    const drugById = new Map<string, { id: string; name: string }>();
    if (rxDrugIds.length > 0) {
      const rows = await tx
        .select({ id: drugs.id, name: drugs.name })
        .from(drugs)
        .where(and(eq(drugs.tenantId, tenantId), inArray(drugs.id, rxDrugIds)));
      for (const r of rows) drugById.set(r.id, r);
      const missing = rxDrugIds.filter((id) => !drugById.has(id));
      if (missing.length > 0) throw Errors.validation({ drugIds: missing }, 'Unknown drug selected');
    }
    const orderTestIds = [...new Set(input.labOrders.map((l) => l.testId).filter((x): x is string => Boolean(x)))];
    const testById = new Map<string, { id: string; name: string; code: string | null }>();
    if (orderTestIds.length > 0) {
      const rows = await tx
        .select({ id: labTests.id, name: labTests.name, code: labTests.code })
        .from(labTests)
        .where(and(eq(labTests.tenantId, tenantId), inArray(labTests.id, orderTestIds)));
      for (const r of rows) testById.set(r.id, r);
      const missing = orderTestIds.filter((id) => !testById.has(id));
      if (missing.length > 0) throw Errors.validation({ testIds: missing }, 'Unknown lab test selected');
    }

    // Diagnoses have no downstream consumers — replacing them wholesale is safe.
    await tx.delete(diagnoses).where(eq(diagnoses.encounterId, encounterId));
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

    // Prescriptions and lab orders DO have downstream consumers (pharmacy dispenses, lab
    // sample collection / results — lab_results cascade from lab_orders). A re-save must
    // never replace a row the downstream has progressed: rows still `ordered` are synced
    // against the input (update by id / insert new / delete removed); anything past
    // `ordered` is immutable clinical history and survives every save untouched.
    const existingRx = await tx.select().from(prescriptions).where(eq(prescriptions.encounterId, encounterId));
    const openRxById = new Map(existingRx.filter((r) => r.status === 'ordered').map((r) => [r.id, r]));
    const keptRxIds = new Set<string>();
    for (const p of input.prescriptions) {
      const masterName = p.drugId ? drugById.get(p.drugId)!.name : null;
      const fields = {
        drugId: p.drugId ?? null,
        drugName: masterName ?? p.drugName,
        dose: p.dose ?? null,
        frequency: p.frequency ?? null,
        duration: p.duration ?? null,
        route: p.route ?? null,
        instructions: p.instructions ?? null,
      };
      if (p.id && openRxById.has(p.id)) {
        keptRxIds.add(p.id);
        await tx.update(prescriptions).set(fields).where(eq(prescriptions.id, p.id));
      } else if (!p.id) {
        await tx.insert(prescriptions).values({
          tenantId,
          encounterId,
          visitId: e.visitId,
          patientId: e.patientId,
          ...fields,
          prescribedBy: actorUserId ?? null,
        });
      }
      // p.id pointing at a dispensed/cancelled (or foreign) row: ignored — that row is history.
    }
    const rxToDelete = [...openRxById.keys()].filter((id) => !keptRxIds.has(id));
    if (rxToDelete.length > 0) await tx.delete(prescriptions).where(inArray(prescriptions.id, rxToDelete));

    const existingOrders = await tx.select().from(labOrders).where(eq(labOrders.encounterId, encounterId));
    const openOrderById = new Map(existingOrders.filter((o) => o.status === 'ordered').map((o) => [o.id, o]));
    const keptOrderIds = new Set<string>();
    for (const l of input.labOrders) {
      const master = l.testId ? testById.get(l.testId)! : null;
      const fields = {
        testId: l.testId ?? null,
        testName: master?.name ?? l.testName,
        testCode: master ? master.code : (l.testCode ?? null),
        priority: l.priority ?? 'routine',
        notes: l.notes ?? null,
      };
      if (l.id && openOrderById.has(l.id)) {
        keptOrderIds.add(l.id);
        await tx.update(labOrders).set(fields).where(eq(labOrders.id, l.id));
      } else if (!l.id) {
        await tx.insert(labOrders).values({
          tenantId,
          encounterId,
          visitId: e.visitId,
          patientId: e.patientId,
          ...fields,
          orderedBy: actorUserId ?? null,
        });
      }
    }
    const ordersToDelete = [...openOrderById.keys()].filter((id) => !keptOrderIds.has(id));
    if (ordersToDelete.length > 0) await tx.delete(labOrders).where(inArray(labOrders.id, ordersToDelete));
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

    // Signing completes the visit, so it must respect the visit state machine: only a live
    // visit can complete — never a cancelled (or already completed) one.
    const visit = (
      await tx.select().from(visits).where(and(eq(visits.tenantId, tenantId), eq(visits.id, e.visitId))).limit(1)
    )[0];
    if (!visit) throw Errors.notFound('Visit not found');
    if (visit.status !== 'checked_in' && visit.status !== 'in_consultation') {
      throw Errors.conflict(`Cannot sign the consultation of a ${visit.status} visit`);
    }

    // CAS on status so two sign requests cannot both win.
    const signed = await tx
      .update(encounters)
      .set({ status: 'signed', signedAt: new Date(), version: e.version + 1, updatedAt: new Date() })
      .where(and(eq(encounters.id, encounterId), eq(encounters.status, 'draft')))
      .returning({ id: encounters.id });
    if (!signed[0]) throw Errors.conflict('Encounter is already signed');

    const moved = await tx
      .update(visits)
      .set({ status: 'completed', completedAt: new Date(), version: visit.version + 1, updatedAt: new Date() })
      .where(and(eq(visits.id, e.visitId), eq(visits.version, visit.version)))
      .returning({ id: visits.id });
    if (!moved[0]) throw Errors.conflict('This visit was updated by someone else — please refresh');

    // The originating appointment (if any) is fulfilled once the consultation is signed.
    if (visit.appointmentId) {
      await tx
        .update(appointments)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(and(eq(appointments.id, visit.appointmentId), eq(appointments.status, 'booked')));
    }
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

// Read one encounter (no side effects — unlike open, this never creates a draft). EMR_VIEW.
export async function getEncounter(tenantId: string, encounterId: string) {
  return buildDto(tenantId, encounterId);
}

// A patient's clinical history: signed encounters, newest first, with visit context and the
// headline clinical facts. The full chart for any row is `GET /encounters/:id`.
export async function listPatientEncounters(tenantId: string, patientId: string) {
  return runWithTenant(tenantId, async (tx) => {
    const patient = (
      await tx.select({ id: patients.id }).from(patients).where(and(eq(patients.tenantId, tenantId), eq(patients.id, patientId))).limit(1)
    )[0];
    if (!patient) throw Errors.notFound('Patient not found');

    const rows = await tx
      .select({
        e: encounters,
        visitNumber: visits.visitNumber,
        visitDate: visits.visitDate,
        providerName: providers.fullName,
      })
      .from(encounters)
      .innerJoin(visits, eq(visits.id, encounters.visitId))
      .leftJoin(providers, eq(providers.id, encounters.providerId))
      .where(and(eq(encounters.tenantId, tenantId), eq(encounters.patientId, patientId), eq(encounters.status, 'signed')))
      .orderBy(desc(encounters.signedAt));

    const ids = rows.map((r) => r.e.id);
    const dxByEncounter = new Map<string, Array<{ icd10Code: string; icd10Term: string; isPrimary: boolean }>>();
    const rxCount = new Map<string, number>();
    const labCount = new Map<string, number>();
    if (ids.length > 0) {
      const [dx, rx, lab] = await Promise.all([
        tx
          .select({ encounterId: diagnoses.encounterId, icd10Code: diagnoses.icd10Code, icd10Term: diagnoses.icd10Term, isPrimary: diagnoses.isPrimary })
          .from(diagnoses)
          .where(inArray(diagnoses.encounterId, ids)),
        tx.select({ encounterId: prescriptions.encounterId }).from(prescriptions).where(inArray(prescriptions.encounterId, ids)),
        tx.select({ encounterId: labOrders.encounterId }).from(labOrders).where(inArray(labOrders.encounterId, ids)),
      ]);
      for (const d of dx) {
        const list = dxByEncounter.get(d.encounterId) ?? [];
        list.push({ icd10Code: d.icd10Code, icd10Term: d.icd10Term, isPrimary: d.isPrimary });
        dxByEncounter.set(d.encounterId, list);
      }
      for (const r of rx) rxCount.set(r.encounterId, (rxCount.get(r.encounterId) ?? 0) + 1);
      for (const l of lab) labCount.set(l.encounterId, (labCount.get(l.encounterId) ?? 0) + 1);
    }

    return rows.map((r) => ({
      id: r.e.id,
      visitId: r.e.visitId,
      visitNumber: r.visitNumber,
      visitDate: r.visitDate,
      providerName: r.providerName,
      signedAt: r.e.signedAt ? r.e.signedAt.toISOString() : null,
      chiefComplaint: r.e.chiefComplaint,
      diagnoses: (dxByEncounter.get(r.e.id) ?? []).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
      prescriptionCount: rxCount.get(r.e.id) ?? 0,
      labOrderCount: labCount.get(r.e.id) ?? 0,
    }));
  });
}
