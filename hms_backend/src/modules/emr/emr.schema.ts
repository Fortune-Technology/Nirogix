import { z } from '../../openapi/registry';

const nnum = z.number().nullable().optional();

// ---- Requests --------------------------------------------------------------

export const OpenEncounterBody = z.object({ visitId: z.string().uuid() }).openapi('OpenEncounterBody');

// Vitals are the workflow module's record; the encounter reports them rather than defining them.
import { VitalsRecordListSchema } from '../workflow/workflow.schema';

export { VitalsRecordSchema, VitalsRecordListSchema } from '../workflow/workflow.schema';

export const VitalsSchema = z
  .object({
    systolic: nnum,
    diastolic: nnum,
    pulse: nnum,
    spo2: nnum,
    respRate: nnum,
    tempC: nnum,
    weightKg: nnum,
    heightCm: nnum,
    bloodSugarMgDl: nnum,
    bloodSugarType: z.enum(['fasting', 'post_prandial', 'random']).nullable().optional(),
  })
  .openapi('Vitals');

export const SaveEncounterBody = z
  .object({
    version: z.number().int(),
    chiefComplaint: z.string().max(500).nullable().optional(),
    subjective: z.string().nullable().optional(),
    objective: z.string().nullable().optional(),
    assessment: z.string().nullable().optional(),
    plan: z.string().nullable().optional(),
    vitals: VitalsSchema.optional(),
    diagnoses: z
      .array(
        z.object({
          icd10Code: z.string().min(1).max(10),
          icd10Term: z.string().min(1).max(300),
          isPrimary: z.boolean().optional(),
          notes: z.string().max(500).nullable().optional(),
        }),
      )
      .default([]),
    prescriptions: z
      .array(
        z.object({
          id: z.string().uuid().nullable().optional(),
          drugId: z.string().uuid().nullable().optional(),
          drugName: z.string().min(1).max(200),
          dose: z.string().max(80).nullable().optional(),
          frequency: z.string().max(80).nullable().optional(),
          duration: z.string().max(80).nullable().optional(),
          route: z.string().max(40).nullable().optional(),
          instructions: z.string().max(500).nullable().optional(),
        }),
      )
      .default([]),
    labOrders: z
      .array(
        z.object({
          id: z.string().uuid().nullable().optional(),
          testId: z.string().uuid().nullable().optional(),
          testName: z.string().min(1).max(200),
          testCode: z.string().max(40).nullable().optional(),
          priority: z.enum(['routine', 'urgent']).optional(),
          notes: z.string().max(500).nullable().optional(),
        }),
      )
      .default([]),
  })
  .openapi('SaveEncounterBody');

// ---- Responses -------------------------------------------------------------

export const DiagnosisSchema = z
  .object({
    id: z.string(),
    icd10Code: z.string(),
    icd10Term: z.string(),
    isPrimary: z.boolean(),
    notes: z.string().nullable(),
  })
  .openapi('Diagnosis');

export const PrescriptionSchema = z
  .object({
    id: z.string(),
    drugId: z.string().nullable(),
    drugName: z.string(),
    dose: z.string().nullable(),
    frequency: z.string().nullable(),
    duration: z.string().nullable(),
    route: z.string().nullable(),
    instructions: z.string().nullable(),
    status: z.string(),
  })
  .openapi('Prescription');

export const LabOrderSchema = z
  .object({
    id: z.string(),
    testId: z.string().nullable(),
    testName: z.string(),
    testCode: z.string().nullable(),
    priority: z.string(),
    status: z.string(),
    notes: z.string().nullable(),
  })
  .openapi('LabOrder');

// One reopening of a signed consultation (ADR-134). The snapshot itself is never returned —
// the trail is what a chart shows; the frozen note stays server-side as the preserved original.
export const EncounterAmendmentSchema = z
  .object({
    id: z.string(),
    status: z.enum(['open', 'completed', 'cancelled']),
    reason: z.string(),
    changedFields: z.array(z.string()).nullable(),
    amendedById: z.string().nullable(),
    amendedByName: z.string().nullable(),
    createdAt: z.string(),
    completedAt: z.string().nullable(),
  })
  .openapi('EncounterAmendment');

export const AmendEncounterBody = z
  .object({
    // Long enough to be a reason rather than a keystroke; it is permanent and someone reads it.
    reason: z.string().trim().min(10, 'Say why the signed record is being corrected').max(1000),
  })
  .openapi('AmendEncounterRequest');

export const EncounterSchema = z
  .object({
    id: z.string(),
    visitId: z.string(),
    patientId: z.string(),
    patientName: z.string(),
    patientUhid: z.string(),
    providerId: z.string().nullable(),
    providerName: z.string().nullable(),
    status: z.enum(['draft', 'signed', 'amending']),
    version: z.number(),
    signedAt: z.string().nullable(),
    wasSigned: z.boolean(),
    amendments: z.array(EncounterAmendmentSchema),
    openAmendment: EncounterAmendmentSchema.nullable(),
    chiefComplaint: z.string().nullable(),
    subjective: z.string().nullable(),
    objective: z.string().nullable(),
    assessment: z.string().nullable(),
    plan: z.string().nullable(),
    vitals: z.object({
      systolic: z.number().nullable(),
      diastolic: z.number().nullable(),
      pulse: z.number().nullable(),
      spo2: z.number().nullable(),
      respRate: z.number().nullable(),
      tempC: z.number().nullable(),
      weightKg: z.number().nullable(),
      heightCm: z.number().nullable(),
      bloodSugarMgDl: z.number().nullable(),
      bloodSugarType: z.enum(['fasting', 'post_prandial', 'random']).nullable(),
    }),
    vitalsHistory: VitalsRecordListSchema,
    diagnoses: z.array(DiagnosisSchema),
    prescriptions: z.array(PrescriptionSchema),
    labOrders: z.array(LabOrderSchema),
  })
  .openapi('Encounter');

export const Icd10Schema = z.object({ code: z.string(), term: z.string() }).openapi('Icd10Code');
export const Icd10ListSchema = z.array(Icd10Schema).openapi('Icd10List');

// ---- AI prescription draft (ADR-070) ----------------------------------------

export const AiDraftBody = z
  .object({
    chiefComplaint: z.string().max(500).nullable().optional(),
    diagnoses: z.array(z.object({ icd10Code: z.string().max(10), icd10Term: z.string().max(300) })).default([]),
    ageYears: z.number().int().min(0).max(130).nullable().optional(),
    gender: z.string().max(20).nullable().optional(),
    vitalsSummary: z.string().max(300).nullable().optional(),
  })
  .openapi('AiDraftBody');

export const AiDraftResponseSchema = z
  .object({
    prescriptions: z.array(
      z.object({
        drugName: z.string(),
        dose: z.string().nullable(),
        frequency: z.string().nullable(),
        duration: z.string().nullable(),
        route: z.string().nullable(),
        instructions: z.string().nullable(),
        drugId: z.string().nullable(),
      }),
    ),
    note: z.string().nullable(),
  })
  .openapi('AiDraftResponse');

export const AiCapabilitiesSchema = z.object({ prescriptionDraft: z.boolean() }).openapi('AiCapabilities');

// One row of a patient's clinical history (signed encounters only).
export const EncounterSummarySchema = z
  .object({
    id: z.string(),
    visitId: z.string(),
    visitNumber: z.string(),
    visitDate: z.string(),
    providerName: z.string().nullable(),
    signedAt: z.string().nullable(),
    chiefComplaint: z.string().nullable(),
    diagnoses: z.array(z.object({ icd10Code: z.string(), icd10Term: z.string(), isPrimary: z.boolean() })),
    prescriptionCount: z.number(),
    labOrderCount: z.number(),
  })
  .openapi('EncounterSummary');
export const EncounterSummaryListSchema = z.array(EncounterSummarySchema).openapi('EncounterSummaryList');
