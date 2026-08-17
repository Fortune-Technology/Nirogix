import { z } from '../../openapi/registry';

const nnum = z.number().nullable().optional();

// ---- Requests --------------------------------------------------------------

export const OpenEncounterBody = z.object({ visitId: z.string().uuid() }).openapi('OpenEncounterBody');

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

export const EncounterSchema = z
  .object({
    id: z.string(),
    visitId: z.string(),
    patientId: z.string(),
    patientName: z.string(),
    patientUhid: z.string(),
    providerId: z.string().nullable(),
    providerName: z.string().nullable(),
    status: z.string(),
    version: z.number(),
    signedAt: z.string().nullable(),
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
    }),
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
