import { z } from '../../openapi/registry';

// ---- Requests --------------------------------------------------------------

export const CreateTestBody = z
  .object({
    name: z.string().min(1).max(200),
    code: z.string().max(40).nullable().optional(),
    sampleType: z.string().max(60).nullable().optional(),
    unit: z.string().max(40).nullable().optional(),
    refLow: z.string().max(40).nullable().optional(),
    refHigh: z.string().max(40).nullable().optional(),
    pricePaise: z.number().int().nonnegative(),
    taxRateBps: z.number().int().min(0).max(100000).optional(),
  })
  .openapi('CreateLabTestBody');

export const EnterResultBody = z
  .object({
    testId: z.string().uuid().nullable().optional(),
    value: z.string().min(1).max(200),
    unit: z.string().max(40).nullable().optional(),
    refLow: z.string().max(40).nullable().optional(),
    refHigh: z.string().max(40).nullable().optional(),
    flag: z.enum(['normal', 'low', 'high', 'critical']).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    /** Attached report file id (upload through POST /files first). */
    fileId: z.string().uuid().nullable().optional(),
  })
  .openapi('EnterResultBody');

// ---- Responses -------------------------------------------------------------

export const LabTestSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    code: z.string().nullable(),
    sampleType: z.string().nullable(),
    unit: z.string().nullable(),
    refLow: z.string().nullable(),
    refHigh: z.string().nullable(),
    pricePaise: z.number(),
    taxRateBps: z.number(),
    isActive: z.boolean(),
  })
  .openapi('LabTest');

export const LabTestListSchema = z.array(LabTestSchema).openapi('LabTestList');

export const LabResultSchema = z
  .object({
    value: z.string(),
    unit: z.string().nullable(),
    flag: z.string(),
    refLow: z.string().nullable(),
    refHigh: z.string().nullable(),
    notes: z.string().nullable(),
    verifiedAt: z.string().nullable(),
    hasAttachment: z.boolean(),
  })
  .openapi('LabResult');

export const LabOrderSchema = z
  .object({
    id: z.string(),
    testId: z.string().nullable(),
    testName: z.string(),
    testCode: z.string().nullable(),
    priority: z.string(),
    status: z.string(),
    notes: z.string().nullable(),
    visitId: z.string(),
    patientId: z.string(),
    patientName: z.string(),
    patientUhid: z.string(),
    createdAt: z.string(),
    result: LabResultSchema.nullable(),
  })
  .openapi('LabOrder');

export const LabWorklistSchema = z.array(LabOrderSchema).openapi('LabWorklist');
