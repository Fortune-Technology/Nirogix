import { and, desc, eq, inArray, notExists, sql } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import {
  patientVitals,
  visits,
  patients,
  providers,
  users,
  encounters,
  type PatientVitalsRow,
} from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';
import { resolveConfig, type VitalParameter } from './workflowConfig.service';

/**
 * Vitals (ADR-113).
 *
 * A vitals observation belongs to a **visit**, not to a consultation. That is the whole reason this
 * module exists: the desk and the vitals room both record readings before any encounter has been
 * created, and an encounter cannot be created until the payment gate is satisfied.
 *
 * Readings are never edited in place. Re-taking a blood pressure writes a new row, so the chart
 * keeps both numbers with the time and the person attached to each — which is what a clinician
 * needs when two readings disagree.
 */

export type VitalsStage = 'check_in' | 'pre_consultation' | 'consultation';

export interface VitalsInput {
  systolic?: number | null;
  diastolic?: number | null;
  pulse?: number | null;
  spo2?: number | null;
  respRate?: number | null;
  tempC?: number | null;
  weightKg?: number | null;
  heightCm?: number | null;
  bloodSugarMgDl?: number | null;
  bloodSugarType?: 'fasting' | 'post_prandial' | 'random' | null;
  notes?: string | null;
}

export interface VitalsRecordDto {
  id: string;
  visitId: string;
  patientId: string;
  stage: VitalsStage;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  spo2: number | null;
  respRate: number | null;
  tempC: number | null;
  weightKg: number | null;
  heightCm: number | null;
  bloodSugarMgDl: number | null;
  bloodSugarType: 'fasting' | 'post_prandial' | 'random' | null;
  notes: string | null;
  recordedBy: string | null;
  recordedByName: string | null;
  recordedAt: string;
  version: number;
}

/**
 * Storage is in exact integer units (tenths of a degree, grams); the API speaks the units a human
 * uses. The conversion lives here alone so a display bug cannot become a stored one.
 */
export function vitalsRowToDto(
  row: PatientVitalsRow,
  recordedByName: string | null,
): VitalsRecordDto {
  return {
    id: row.id,
    visitId: row.visitId,
    patientId: row.patientId,
    stage: row.stage as VitalsStage,
    systolic: row.systolic,
    diastolic: row.diastolic,
    pulse: row.pulse,
    spo2: row.spo2,
    respRate: row.respRate,
    tempC: row.tempCTenths != null ? row.tempCTenths / 10 : null,
    weightKg: row.weightG != null ? row.weightG / 1000 : null,
    heightCm: row.heightCm,
    bloodSugarMgDl: row.bloodSugarMgDl,
    bloodSugarType: (row.bloodSugarType as VitalsRecordDto['bloodSugarType']) ?? null,
    notes: row.notes,
    recordedBy: row.recordedBy,
    recordedByName,
    recordedAt: row.recordedAt.toISOString(),
    version: row.version,
  };
}

/** Which config parameter each stored reading belongs to, for the required-field check. */
const PARAM_FIELDS: Record<VitalParameter, ReadonlyArray<keyof VitalsInput>> = {
  bloodPressure: ['systolic', 'diastolic'],
  pulse: ['pulse'],
  spo2: ['spo2'],
  respRate: ['respRate'],
  tempC: ['tempC'],
  weightKg: ['weightKg'],
  heightCm: ['heightCm'],
  bloodSugar: ['bloodSugarMgDl'],
};

const PARAM_LABELS: Record<VitalParameter, string> = {
  bloodPressure: 'Blood pressure',
  pulse: 'Pulse',
  spo2: 'SpO₂',
  respRate: 'Respiratory rate',
  tempC: 'Temperature',
  weightKg: 'Weight',
  heightCm: 'Height',
  bloodSugar: 'Blood sugar',
};

/**
 * Physiologically possible bounds. Not clinical ranges — a systolic of 200 is a real emergency and
 * must save. These reject the typo: a decimal point in the wrong place, a weight in grams typed
 * into a kilogram field. A number that cannot be measured is a data-entry error, and storing it
 * puts a false reading in a chart.
 */
const BOUNDS: Partial<
  Record<keyof VitalsInput, { min: number; max: number; label: string; unit: string }>
> = {
  systolic: { min: 40, max: 300, label: 'Systolic', unit: 'mmHg' },
  diastolic: { min: 20, max: 200, label: 'Diastolic', unit: 'mmHg' },
  pulse: { min: 20, max: 300, label: 'Pulse', unit: 'bpm' },
  spo2: { min: 50, max: 100, label: 'SpO₂', unit: '%' },
  respRate: { min: 4, max: 90, label: 'Respiratory rate', unit: 'breaths/min' },
  tempC: { min: 25, max: 45, label: 'Temperature', unit: '°C' },
  weightKg: { min: 0.3, max: 400, label: 'Weight', unit: 'kg' },
  heightCm: { min: 20, max: 260, label: 'Height', unit: 'cm' },
  bloodSugarMgDl: { min: 10, max: 900, label: 'Blood sugar', unit: 'mg/dL' },
};

function validateReadings(input: VitalsInput): void {
  for (const [field, bound] of Object.entries(BOUNDS) as Array<
    [keyof VitalsInput, NonNullable<(typeof BOUNDS)[keyof VitalsInput]>]
  >) {
    const value = input[field];
    if (value == null || typeof value !== 'number') continue;
    if (value < bound.min || value > bound.max) {
      throw Errors.validation(
        undefined,
        `${bound.label} must be between ${bound.min} and ${bound.max} ${bound.unit}`,
      );
    }
  }
  // Half a blood pressure is not a blood pressure, and 120/— cannot be read.
  const hasSystolic = input.systolic != null;
  const hasDiastolic = input.diastolic != null;
  if (hasSystolic !== hasDiastolic) {
    throw Errors.validation(
      undefined,
      'Record both the systolic and the diastolic pressure, or neither',
    );
  }
  if (hasSystolic && hasDiastolic && input.systolic! <= input.diastolic!) {
    throw Errors.validation(undefined, 'The systolic pressure must be higher than the diastolic');
  }
  // A sugar reading nobody can interpret is worse than no reading.
  if (input.bloodSugarMgDl != null && !input.bloodSugarType) {
    throw Errors.validation(
      undefined,
      'Say whether the blood sugar is fasting, post-prandial or random',
    );
  }
}

/** True when the input carries at least one actual reading. */
export function hasAnyReading(input: VitalsInput): boolean {
  return Object.entries(input).some(
    ([key, value]) => key !== 'notes' && key !== 'bloodSugarType' && value != null,
  );
}

/**
 * Enforces the hospital's required-parameter list. Called on the paths where a hospital has said
 * "we always take these" — never as a general rule, because a doctor amending one reading mid
 * consultation must not be forced to re-enter the other five.
 */
export function assertRequiredPresent(
  input: VitalsInput,
  required: readonly VitalParameter[],
): void {
  const missing = required.filter((param) =>
    PARAM_FIELDS[param].some((field) => input[field] == null),
  );
  if (missing.length > 0) {
    throw Errors.validation(
      undefined,
      `This hospital requires ${missing.map((m) => PARAM_LABELS[m]).join(', ')} to be recorded`,
    );
  }
}

export interface RecordVitalsInput extends VitalsInput {
  visitId: string;
  stage: VitalsStage;
}

/**
 * Write one observation against a visit.
 *
 * The stage is checked against the hospital's configuration, not merely accepted: a hospital that
 * has not asked for vitals at the desk must not end up with desk readings because a client sent
 * `stage: check_in`. The permission says *who* may record; the mode says *where in the workflow*
 * recording happens, and both are enforced here.
 */
export async function recordVitals(
  tenantId: string,
  input: RecordVitalsInput,
  actorUserId?: string,
): Promise<VitalsRecordDto> {
  validateReadings(input);
  if (!hasAnyReading(input)) {
    throw Errors.validation(undefined, 'Enter at least one reading');
  }

  const visit = await runWithTenant(tenantId, async (tx) => {
    const row = (
      await tx
        .select({
          id: visits.id,
          patientId: visits.patientId,
          branchId: visits.branchId,
          status: visits.status,
        })
        .from(visits)
        .where(and(eq(visits.tenantId, tenantId), eq(visits.id, input.visitId)))
        .limit(1)
    )[0];
    if (!row) throw Errors.notFound('Visit not found');
    return row;
  });

  if (visit.status === 'cancelled') {
    throw Errors.conflict('This visit was cancelled; vitals cannot be recorded against it');
  }

  const resolved = await resolveConfig(tenantId, visit.branchId);
  if (resolved.vitalsMode === 'disabled') {
    throw Errors.conflict('This hospital does not record vitals');
  }
  if (input.stage === 'check_in' && resolved.vitalsMode !== 'during_checkin') {
    throw Errors.conflict('This hospital does not record vitals at check-in');
  }
  if (input.stage === 'pre_consultation' && resolved.vitalsMode !== 'after_checkin') {
    throw Errors.conflict('This hospital does not run a separate vitals step');
  }

  const created = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .insert(patientVitals)
      .values({
        tenantId,
        branchId: visit.branchId,
        visitId: visit.id,
        patientId: visit.patientId,
        stage: input.stage,
        systolic: input.systolic ?? null,
        diastolic: input.diastolic ?? null,
        pulse: input.pulse ?? null,
        spo2: input.spo2 ?? null,
        respRate: input.respRate ?? null,
        tempCTenths: input.tempC != null ? Math.round(input.tempC * 10) : null,
        weightG: input.weightKg != null ? Math.round(input.weightKg * 1000) : null,
        heightCm: input.heightCm ?? null,
        bloodSugarMgDl: input.bloodSugarMgDl ?? null,
        bloodSugarType: input.bloodSugarType ?? null,
        notes: input.notes ?? null,
        recordedBy: actorUserId ?? null,
      })
      .returning();
    return rows[0]!;
  });

  await writeAudit({
    tenantId,
    actorUserId,
    action: 'emr.vitals.recorded',
    resourceType: 'patient_vitals',
    resourceId: created.id,
    metadata: { visitId: visit.id, patientId: visit.patientId, stage: input.stage },
  });

  return vitalsRowToDto(created, null);
}

/** Every reading taken on a visit, newest first. */
export async function listForVisit(tenantId: string, visitId: string): Promise<VitalsRecordDto[]> {
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({ v: patientVitals, recorderName: users.fullName })
      .from(patientVitals)
      .leftJoin(users, eq(users.id, patientVitals.recordedBy))
      .where(and(eq(patientVitals.tenantId, tenantId), eq(patientVitals.visitId, visitId)))
      .orderBy(desc(patientVitals.recordedAt));
    return rows.map((r) => vitalsRowToDto(r.v, r.recorderName ?? null));
  });
}

/** The most recent reading on a visit, which is what the consultation shows. */
export async function latestForVisit(
  tenantId: string,
  visitId: string,
): Promise<VitalsRecordDto | null> {
  const all = await listForVisit(tenantId, visitId);
  return all[0] ?? null;
}

export interface VitalsQueueEntryDto {
  visitId: string;
  tokenNumber: number;
  visitNumber: string;
  patientId: string;
  patientName: string;
  patientUhid: string;
  providerName: string | null;
  department: string | null;
  checkedInAt: string;
  latestVitals: VitalsRecordDto | null;
}

/**
 * The vitals queue (`vitalsMode: after_checkin`).
 *
 * **Derived, never stored.** A visit is on this queue while it is checked in and no consultation has
 * started — nothing has to be kept in step with the visit's own status, so the queue cannot go
 * stale or disagree with the OPD board. Visits that already have a reading stay on it, marked done,
 * because the nurse needs to see what they have completed and be able to re-take a reading.
 */
export async function listVitalsQueue(
  tenantId: string,
  opts: { branchId?: string | null; pending?: boolean } = {},
): Promise<VitalsQueueEntryDto[]> {
  const rows = await runWithTenant(tenantId, async (tx) => {
    const conds = [
      eq(visits.tenantId, tenantId),
      eq(visits.visitDate, new Date().toISOString().slice(0, 10)),
      inArray(visits.status, ['checked_in']),
      // A consultation having started means the patient has moved past this step.
      notExists(
        tx
          .select({ one: sql`1` })
          .from(encounters)
          .where(and(eq(encounters.tenantId, tenantId), eq(encounters.visitId, visits.id))),
      ),
    ];
    if (opts.branchId) conds.push(eq(visits.branchId, opts.branchId));

    return tx
      .select({
        visitId: visits.id,
        tokenNumber: visits.tokenNumber,
        visitNumber: visits.visitNumber,
        patientId: visits.patientId,
        patientFirst: patients.firstName,
        patientLast: patients.lastName,
        patientUhid: patients.uhid,
        providerName: providers.fullName,
        department: visits.department,
        checkedInAt: visits.checkedInAt,
      })
      .from(visits)
      .innerJoin(patients, eq(patients.id, visits.patientId))
      .leftJoin(providers, eq(providers.id, visits.providerId))
      .where(and(...conds))
      .orderBy(visits.tokenNumber);
  });

  const entries: VitalsQueueEntryDto[] = [];
  for (const row of rows) {
    const latest = await latestForVisit(tenantId, row.visitId);
    if (opts.pending && latest) continue;
    entries.push({
      visitId: row.visitId,
      tokenNumber: row.tokenNumber,
      visitNumber: row.visitNumber,
      patientId: row.patientId,
      patientName: `${row.patientFirst} ${row.patientLast ?? ''}`.trim(),
      patientUhid: row.patientUhid,
      providerName: row.providerName,
      department: row.department,
      checkedInAt: row.checkedInAt.toISOString(),
      latestVitals: latest,
    });
  }
  return entries;
}

/**
 * Records the readings the front desk took as part of check-in.
 *
 * Separate from `recordVitals` because check-in has already validated the visit and is inside its
 * own flow: this is the part that must not fail the check-in. A hospital's required-parameter list
 * IS enforced (the desk was shown those fields as mandatory), but a failure here has to surface
 * before the visit is created, which is why check-in calls `assertRequiredPresent` up front.
 */
export async function recordCheckInVitals(
  tenantId: string,
  args: { visitId: string; patientId: string; branchId: string | null; input: VitalsInput },
  actorUserId?: string,
): Promise<void> {
  validateReadings(args.input);
  const created = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .insert(patientVitals)
      .values({
        tenantId,
        branchId: args.branchId,
        visitId: args.visitId,
        patientId: args.patientId,
        stage: 'check_in',
        systolic: args.input.systolic ?? null,
        diastolic: args.input.diastolic ?? null,
        pulse: args.input.pulse ?? null,
        spo2: args.input.spo2 ?? null,
        respRate: args.input.respRate ?? null,
        tempCTenths: args.input.tempC != null ? Math.round(args.input.tempC * 10) : null,
        weightG: args.input.weightKg != null ? Math.round(args.input.weightKg * 1000) : null,
        heightCm: args.input.heightCm ?? null,
        bloodSugarMgDl: args.input.bloodSugarMgDl ?? null,
        bloodSugarType: args.input.bloodSugarType ?? null,
        notes: args.input.notes ?? null,
        recordedBy: actorUserId ?? null,
      })
      .returning({ id: patientVitals.id });
    return rows[0]!;
  });

  await writeAudit({
    tenantId,
    actorUserId,
    action: 'emr.vitals.recorded',
    resourceType: 'patient_vitals',
    resourceId: created.id,
    metadata: { visitId: args.visitId, patientId: args.patientId, stage: 'check_in' },
  });
}
