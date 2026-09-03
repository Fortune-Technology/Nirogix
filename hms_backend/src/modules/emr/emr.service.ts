import { and, desc, eq, inArray } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import {
  encounters,
  encounterAmendments,
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
  patientVitals,
  users,
} from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';
import { eventBus } from '../../events/eventBus';
import {
  latestForVisit as latestVitalsForVisit,
  recordVitals,
  vitalsRowToDto,
  type VitalsInput,
} from '../workflow/vitals.service';
import { resolveConfig } from '../workflow/workflowConfig.service';

export { searchIcd10 } from './icd10.data';

// Clinical Workflow / EMR (development-plan §12). One encounter per visit, saved whole while
// draft, then signed to lock. Vitals are stored as integer units and converted at the edge.

// One definition of a set of readings, owned by the module that stores them (ADR-113). A second
// copy here is how the two would quietly diverge.
export type { VitalsInput } from '../workflow/vitals.service';

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

/** An empty set of readings — what the DTO reports when nothing has been taken on this visit. */
const NO_VITALS = {
  systolic: null,
  diastolic: null,
  pulse: null,
  spo2: null,
  respRate: null,
  tempC: null,
  weightKg: null,
  heightCm: null,
  bloodSugarMgDl: null,
  bloodSugarType: null,
} as const;

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

    const [dx, rx, lab, amendmentRows] = await Promise.all([
      tx.select().from(diagnoses).where(eq(diagnoses.encounterId, encounterId)).orderBy(diagnoses.createdAt),
      tx.select().from(prescriptions).where(eq(prescriptions.encounterId, encounterId)).orderBy(prescriptions.createdAt),
      tx.select().from(labOrders).where(eq(labOrders.encounterId, encounterId)).orderBy(labOrders.createdAt),
      // The amendment trail (ADR-134), newest first. The snapshot column is deliberately not
      // selected: the trail is what a chart shows, and a frozen copy of every past note is far
      // more clinical data than the screen displays.
      tx
        .select({ a: encounterAmendments, amenderName: users.fullName })
        .from(encounterAmendments)
        .leftJoin(users, eq(users.id, encounterAmendments.amendedBy))
        .where(and(eq(encounterAmendments.tenantId, tenantId), eq(encounterAmendments.encounterId, encounterId)))
        .orderBy(desc(encounterAmendments.createdAt)),
    ]);

    const amendments = amendmentRows.map((r) => ({
      id: r.a.id,
      status: r.a.status,
      reason: r.a.reason,
      changedFields: (r.a.changedFields as string[] | null) ?? null,
      amendedById: r.a.amendedBy,
      amendedByName: r.amenderName ?? null,
      createdAt: r.a.createdAt.toISOString(),
      completedAt: r.a.completedAt ? r.a.completedAt.toISOString() : null,
    }));

    // Readings belong to the VISIT, so they are fetched by visit and converted by the vitals
    // module — the unit arithmetic must never live in a second place.
    const vitalRows = await tx
      .select({ v: patientVitals, recorderName: users.fullName })
      .from(patientVitals)
      .leftJoin(users, eq(users.id, patientVitals.recordedBy))
      .where(and(eq(patientVitals.tenantId, tenantId), eq(patientVitals.visitId, e.visitId)))
      .orderBy(desc(patientVitals.recordedAt));
    const allVitals = vitalRows.map((r) => vitalsRowToDto(r.v, r.recorderName ?? null));
    const latestVitals = allVitals[0] ?? null;

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
      // A note being amended is editable but is NOT a first draft — the screen has to say
      // "signed, being corrected" rather than offering it as unwritten.
      wasSigned: e.signedAt !== null,
      amendments,
      openAmendment: amendments.find((a) => a.status === 'open') ?? null,
      chiefComplaint: e.chiefComplaint,
      subjective: e.subjective,
      objective: e.objective,
      assessment: e.assessment,
      plan: e.plan,
      // The latest reading on the VISIT, not on this row — so the doctor opens the consultation
      // already seeing what the desk or the vitals room took, which is the point of ADR-113.
      vitals: latestVitals
        ? {
            systolic: latestVitals.systolic,
            diastolic: latestVitals.diastolic,
            pulse: latestVitals.pulse,
            spo2: latestVitals.spo2,
            respRate: latestVitals.respRate,
            tempC: latestVitals.tempC,
            weightKg: latestVitals.weightKg,
            heightCm: latestVitals.heightCm,
            bloodSugarMgDl: latestVitals.bloodSugarMgDl,
            bloodSugarType: latestVitals.bloodSugarType,
          }
        : { ...NO_VITALS },
      /** Every reading on this visit, newest first — the doctor sees who took what, and when. */
      vitalsHistory: allVitals,
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
    // Whether the fee gates the consultation is the hospital's decision (ADR-113), because a
    // hospital billing an employer or an insurer cannot collect before the patient is seen.
    // The gate is still enforced *here*, server-side — the setting moves it, it does not move
    // enforcement into the client. `at_checkin` is the same gate: the hospital has told its desk
    // to collect immediately, which is a description of its process, not a weaker rule.
    const workflow = await resolveConfig(tenantId, visit.branchId);
    if (visit.invoiceId && workflow.paymentTiming !== 'after_consultation') {
      const inv = (
        await tx
          .select({ totalPaise: invoices.totalPaise, amountPaidPaise: invoices.amountPaidPaise })
          .from(invoices)
          .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, visit.invoiceId)))
          .limit(1)
      )[0];
      if (inv && inv.totalPaise > inv.amountPaidPaise) {
        throw Errors.conflict('Consultation fee is unpaid. Collect the payment before the consultation starts');
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
    if (!row) throw Errors.conflict('Could not open the encounter. Please retry');
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
    // Signed is closed. The way to change it is to reopen it deliberately (ADR-134), which
    // preserves what was signed first and moves the encounter to `amending`.
    if (e.status === 'signed') {
      throw Errors.conflict('A signed consultation cannot be edited. Amend it to record a correction');
    }
    if (e.status === 'amending') {
      // An amendment belongs to whoever opened it and stated the reason — including an
      // administrator correcting someone else's note, which is exactly the case the plain
      // author check would refuse. Anyone else is still refused, so two people cannot edit
      // through one person's stated reason.
      const open = (
        await tx
          .select()
          .from(encounterAmendments)
          .where(
            and(
              eq(encounterAmendments.tenantId, tenantId),
              eq(encounterAmendments.encounterId, encounterId),
              eq(encounterAmendments.status, 'open'),
            ),
          )
          .limit(1)
      )[0];
      if (!open) throw Errors.conflict('This consultation is not open for amendment');
      if (open.amendedBy && actorUserId && open.amendedBy !== actorUserId) {
        throw Errors.forbidden('Another user is amending this consultation');
      }
    } else if (e.authoredBy && actorUserId && e.authoredBy !== actorUserId) {
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
        version: e.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(encounters.id, encounterId), eq(encounters.version, input.version)))
      .returning({ id: encounters.id });
    if (!bumped[0]) throw Errors.conflict('This encounter was updated elsewhere. Please refresh');

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

  if (input.vitals) {
    await recordConsultationVitals(tenantId, encounterId, input.vitals, actorUserId);
  }

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

/** The readings a clinician typed into the consultation form, written as a visit observation. */
const VITAL_FIELDS = [
  'systolic',
  'diastolic',
  'pulse',
  'spo2',
  'respRate',
  'tempC',
  'weightKg',
  'heightCm',
  'bloodSugarMgDl',
] as const;

async function recordConsultationVitals(
  tenantId: string,
  encounterId: string,
  vitals: VitalsInput,
  actorUserId?: string,
): Promise<void> {
  const context = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({ visitId: encounters.visitId })
      .from(encounters)
      .where(and(eq(encounters.tenantId, tenantId), eq(encounters.id, encounterId)))
      .limit(1);
    return rows[0] ?? null;
  });
  if (!context) return;

  const provided = VITAL_FIELDS.filter((f) => vitals[f] != null);
  if (provided.length === 0) return;

  // Saving a note three times must not put three identical readings in the chart. A reading that
  // differs in any field is a new observation and IS written — that is the doctor correcting or
  // re-taking one, which the chart has to keep.
  const previous = await latestVitalsForVisit(tenantId, context.visitId);
  if (previous && provided.every((f) => previous[f] === vitals[f])) return;

  await recordVitals(
    tenantId,
    { visitId: context.visitId, stage: 'consultation', ...vitals },
    actorUserId,
  );
}

/**
 * The note's content as one comparable value — what an amendment freezes when it opens, and
 * what the re-sign is compared against to say which parts actually changed (ADR-134).
 *
 * Vitals are deliberately absent: they belong to the visit, not to this row (ADR-113), they
 * carry their own recorder and timestamp per reading, and a vitals correction is already a
 * new reading rather than an edit of an old one.
 */
async function readNoteContent(
  tx: Parameters<Parameters<typeof runWithTenant>[1]>[0],
  encounterId: string,
  e: { chiefComplaint: string | null; subjective: string | null; objective: string | null; assessment: string | null; plan: string | null; version: number; signedAt: Date | null },
) {
  const [dx, rx, lab] = await Promise.all([
    tx.select().from(diagnoses).where(eq(diagnoses.encounterId, encounterId)).orderBy(diagnoses.createdAt),
    tx.select().from(prescriptions).where(eq(prescriptions.encounterId, encounterId)).orderBy(prescriptions.createdAt),
    tx.select().from(labOrders).where(eq(labOrders.encounterId, encounterId)).orderBy(labOrders.createdAt),
  ]);
  return {
    chiefComplaint: e.chiefComplaint,
    subjective: e.subjective,
    objective: e.objective,
    assessment: e.assessment,
    plan: e.plan,
    diagnoses: dx.map((d) => ({ icd10Code: d.icd10Code, icd10Term: d.icd10Term, isPrimary: d.isPrimary, notes: d.notes })),
    prescriptions: rx.map((p) => ({
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
      testId: l.testId,
      testName: l.testName,
      testCode: l.testCode,
      priority: l.priority,
      status: l.status,
      notes: l.notes,
    })),
    signedAtVersion: e.version,
    signedAt: e.signedAt ? e.signedAt.toISOString() : null,
  };
}

type NoteContent = Awaited<ReturnType<typeof readNoteContent>>;

/**
 * A value serialised so that two equal values always produce the same string.
 *
 * `JSON.stringify` is key-order sensitive, and one side of this comparison has been through
 * `jsonb`, which does not preserve key order — it stores keys sorted. Comparing the raw
 * stringifications therefore reported every collection as changed on every amendment, including
 * ones where nothing had been touched. Sorting keys on both sides is what makes the comparison
 * about the values. Array order is left alone: it is meaningful here, since the rows come back
 * ordered by creation and a reordered prescription list is a real difference.
 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/**
 * Which parts of the note differ. Named fields, not a character diff: what a person reading
 * the chart needs is "the plan and the prescriptions changed", and the two full versions are
 * both preserved for anyone who needs the detail.
 *
 * An empty list is a real answer — someone reopened the record, looked, and changed nothing.
 */
function diffNote(before: NoteContent, after: NoteContent): string[] {
  const changed: string[] = [];
  for (const key of ['chiefComplaint', 'subjective', 'objective', 'assessment', 'plan'] as const) {
    if ((before[key] ?? '') !== (after[key] ?? '')) changed.push(key);
  }
  for (const key of ['diagnoses', 'prescriptions', 'labOrders'] as const) {
    if (canonical(before[key]) !== canonical(after[key])) changed.push(key);
  }
  return changed;
}

export async function signEncounter(tenantId: string, encounterId: string, actorUserId?: string) {
  const result = await runWithTenant(tenantId, async (tx) => {
    const e = (
      await tx.select().from(encounters).where(and(eq(encounters.tenantId, tenantId), eq(encounters.id, encounterId))).limit(1)
    )[0];
    if (!e) throw Errors.notFound('Encounter not found');
    if (e.status === 'signed') throw Errors.conflict('Encounter is already signed');

    // Re-signing an amendment closes the correction; a first signature also completes the visit.
    // The two share the signature and nothing else, so the visit state machine is only consulted
    // on the path that actually moves it.
    const amending = e.status === 'amending';

    const open = amending
      ? (
          await tx
            .select()
            .from(encounterAmendments)
            .where(
              and(
                eq(encounterAmendments.tenantId, tenantId),
                eq(encounterAmendments.encounterId, encounterId),
                eq(encounterAmendments.status, 'open'),
              ),
            )
            .limit(1)
        )[0]
      : undefined;
    if (amending && !open) throw Errors.conflict('This consultation is not open for amendment');

    if (amending) {
      if (open!.amendedBy && actorUserId && open!.amendedBy !== actorUserId) {
        throw Errors.forbidden('Another user is amending this consultation');
      }
    } else if (e.authoredBy && actorUserId && e.authoredBy !== actorUserId) {
      throw Errors.forbidden("You cannot sign another clinician's encounter");
    }

    // Signing completes the visit, so it must respect the visit state machine: only a live
    // visit can complete — never a cancelled (or already completed) one. An amendment never
    // touches the visit, which completed when the note was first signed.
    let visit: typeof visits.$inferSelect | undefined;
    if (!amending) {
      visit = (
        await tx.select().from(visits).where(and(eq(visits.tenantId, tenantId), eq(visits.id, e.visitId))).limit(1)
      )[0];
      if (!visit) throw Errors.notFound('Visit not found');
      if (visit.status !== 'checked_in' && visit.status !== 'in_consultation') {
        throw Errors.conflict(`Cannot sign the consultation of a ${visit.status} visit`);
      }
    }

    // What the note says now — read before the status flips, and compared against the frozen
    // original so the amendment can record which parts were actually corrected.
    const changedFields = amending ? diffNote(open!.snapshot as NoteContent, await readNoteContent(tx, encounterId, e)) : null;

    // CAS on status so two sign requests cannot both win.
    const signed = await tx
      .update(encounters)
      .set({ status: 'signed', signedAt: new Date(), version: e.version + 1, updatedAt: new Date() })
      .where(and(eq(encounters.id, encounterId), eq(encounters.status, e.status)))
      .returning({ id: encounters.id });
    if (!signed[0]) throw Errors.conflict('Encounter is already signed');

    if (amending) {
      await tx
        .update(encounterAmendments)
        .set({ status: 'completed', changedFields, completedAt: new Date() })
        .where(eq(encounterAmendments.id, open!.id));
      return { visitId: e.visitId, amending: true, amendmentId: open!.id, changedFields };
    }

    const moved = await tx
      .update(visits)
      .set({ status: 'completed', completedAt: new Date(), version: visit!.version + 1, updatedAt: new Date() })
      .where(and(eq(visits.id, e.visitId), eq(visits.version, visit!.version)))
      .returning({ id: visits.id });
    if (!moved[0]) throw Errors.conflict('This visit was updated by someone else. Please refresh');

    // The originating appointment (if any) is fulfilled once the consultation is signed.
    if (visit!.appointmentId) {
      await tx
        .update(appointments)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(and(eq(appointments.id, visit!.appointmentId), eq(appointments.status, 'booked')));
    }
    return { visitId: e.visitId, amending: false, amendmentId: null, changedFields: null };
  });

  // Downstream consumers (billing, pharmacy, lab, ABDM) act on a consultation being finished.
  // A re-signed amendment is not a second consultation, so it does not republish the event —
  // it has its own audited action instead.
  if (!result.amending) eventBus.publish('encounter.signed', { tenantId, encounterId, visitId: result.visitId });
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: result.amending ? 'encounter.amend_sign' : 'encounter.sign',
    resourceType: 'encounter',
    resourceId: encounterId,
    metadata: result.amending
      ? { visitId: result.visitId, amendmentId: result.amendmentId, changedFields: result.changedFields }
      : { visitId: result.visitId },
  });
  return buildDto(tenantId, encounterId);
}

/**
 * Reopen a signed consultation for correction (ADR-134). `emr.encounter.amend`.
 *
 * The signed note is copied into the amendment row **before** anything becomes editable, so the
 * record the hospital signed survives whatever happens next. The reason is required and
 * permanent. The encounter then behaves like a draft until it is re-signed, at which point the
 * amendment closes carrying the list of fields that actually differ.
 */
export async function openAmendment(tenantId: string, encounterId: string, reason: string, actorUserId?: string) {
  const amendmentId = await runWithTenant(tenantId, async (tx) => {
    const e = (
      await tx.select().from(encounters).where(and(eq(encounters.tenantId, tenantId), eq(encounters.id, encounterId))).limit(1)
    )[0];
    if (!e) throw Errors.notFound('Encounter not found');
    if (e.status === 'amending') throw Errors.conflict('This consultation is already open for amendment');
    if (e.status !== 'signed') throw Errors.conflict('Only a signed consultation can be amended');

    const snapshot = await readNoteContent(tx, encounterId, e);

    // Written before the status moves: if this insert fails, nothing became editable. The
    // partial unique index is what makes a second concurrent open fail rather than overwrite
    // the first amendment's idea of the original.
    const inserted = await tx
      .insert(encounterAmendments)
      .values({
        tenantId,
        encounterId,
        status: 'open',
        reason: reason.trim(),
        snapshot,
        openedAtVersion: e.version,
        amendedBy: actorUserId ?? null,
      })
      .returning({ id: encounterAmendments.id });

    const moved = await tx
      .update(encounters)
      .set({ status: 'amending', version: e.version + 1, updatedAt: new Date() })
      .where(and(eq(encounters.id, encounterId), eq(encounters.status, 'signed')))
      .returning({ id: encounters.id });
    if (!moved[0]) throw Errors.conflict('This consultation was updated elsewhere. Please refresh');

    return inserted[0]!.id;
  });

  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'encounter.amend_open',
    resourceType: 'encounter',
    resourceId: encounterId,
    metadata: { amendmentId, reason: reason.trim() },
  });
  return buildDto(tenantId, encounterId);
}

/**
 * Abandon an amendment that has changed nothing, returning the note to `signed`.
 *
 * Only while nothing has been edited — the encounter's version is still the one the amendment
 * recorded at open. Once a save has landed, the note on screen is no longer the signed one and
 * quietly "cancelling" would either discard a real correction or leave the record disagreeing
 * with itself; the way out of that is to re-sign, which is what the caller is told.
 *
 * The amendment row is kept and marked `cancelled`, never deleted (invariant #6): that somebody
 * reopened a signed record is itself worth knowing.
 */
export async function cancelAmendment(tenantId: string, encounterId: string, actorUserId?: string) {
  const amendmentId = await runWithTenant(tenantId, async (tx) => {
    const e = (
      await tx.select().from(encounters).where(and(eq(encounters.tenantId, tenantId), eq(encounters.id, encounterId))).limit(1)
    )[0];
    if (!e) throw Errors.notFound('Encounter not found');
    if (e.status !== 'amending') throw Errors.conflict('This consultation is not open for amendment');

    const open = (
      await tx
        .select()
        .from(encounterAmendments)
        .where(
          and(
            eq(encounterAmendments.tenantId, tenantId),
            eq(encounterAmendments.encounterId, encounterId),
            eq(encounterAmendments.status, 'open'),
          ),
        )
        .limit(1)
    )[0];
    if (!open) throw Errors.conflict('This consultation is not open for amendment');
    if (open.amendedBy && actorUserId && open.amendedBy !== actorUserId) {
      throw Errors.forbidden('Another user is amending this consultation');
    }
    // Opening bumped the version by one; anything beyond that is a save that has landed.
    if (e.version > open.openedAtVersion + 1) {
      throw Errors.conflict('A correction has already been saved into this amendment. Sign it to record what changed');
    }

    await tx
      .update(encounterAmendments)
      .set({ status: 'cancelled', completedAt: new Date() })
      .where(eq(encounterAmendments.id, open.id));

    const moved = await tx
      .update(encounters)
      .set({ status: 'signed', version: e.version + 1, updatedAt: new Date() })
      .where(and(eq(encounters.id, encounterId), eq(encounters.status, 'amending')))
      .returning({ id: encounters.id });
    if (!moved[0]) throw Errors.conflict('This consultation was updated elsewhere. Please refresh');

    return open.id;
  });

  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'encounter.amend_cancel',
    resourceType: 'encounter',
    resourceId: encounterId,
    metadata: { amendmentId },
  });
  return buildDto(tenantId, encounterId);
}

// Read one encounter (no side effects — unlike open, this never creates a draft). EMR_VIEW.
export async function getEncounter(tenantId: string, encounterId: string) {
  return buildDto(tenantId, encounterId);
}

// Read the visit's encounter without creating one (the print document's read). 404 when the
// consultation has not been opened yet — printing a chart that does not exist is not a thing.
export async function getEncounterByVisitReadOnly(tenantId: string, visitId: string) {
  const row = await runWithTenant(tenantId, async (tx) =>
    (
      await tx
        .select({ id: encounters.id })
        .from(encounters)
        .where(and(eq(encounters.tenantId, tenantId), eq(encounters.visitId, visitId)))
        .limit(1)
    )[0],
  );
  if (!row) throw Errors.notFound('No consultation exists for this visit yet');
  return buildDto(tenantId, row.id);
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
      // HAS BEEN signed, not IS signed: a note being corrected (ADR-134) is still part of this
      // patient's history, and dropping it for the length of an amendment makes the chart lie.
      .where(
        and(
          eq(encounters.tenantId, tenantId),
          eq(encounters.patientId, patientId),
          inArray(encounters.status, ['signed', 'amending']),
        ),
      )
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
