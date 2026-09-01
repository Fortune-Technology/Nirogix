import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { VITALS_MODES, PAYMENT_TIMINGS, VITAL_PARAMETERS } from './workflowConfig.service';

extendZodWithOpenApi(z);

const vitalsMode = z.enum(VITALS_MODES as unknown as [string, ...string[]]);
const paymentTiming = z.enum(PAYMENT_TIMINGS as unknown as [string, ...string[]]);
const vitalParameter = z.enum(VITAL_PARAMETERS as unknown as [string, ...string[]]);

/**
 * Bounds are deliberately physiological, not clinical (see `vitals.service.ts`): the edge is here to
 * reject a misplaced decimal point, never to refuse a reading a patient genuinely has. The service
 * re-checks the same bounds, because validation at the edge does not make a service safe to call.
 */
export const VitalsBody = z.object({
  systolic: z.number().int().min(40).max(300).nullable().optional(),
  diastolic: z.number().int().min(20).max(200).nullable().optional(),
  pulse: z.number().int().min(20).max(300).nullable().optional(),
  spo2: z.number().int().min(50).max(100).nullable().optional(),
  respRate: z.number().int().min(4).max(90).nullable().optional(),
  tempC: z.number().min(25).max(45).nullable().optional(),
  weightKg: z.number().min(0.3).max(400).nullable().optional(),
  heightCm: z.number().int().min(20).max(260).nullable().optional(),
  bloodSugarMgDl: z.number().int().min(10).max(900).nullable().optional(),
  bloodSugarType: z.enum(['fasting', 'post_prandial', 'random']).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const RecordVitalsBody = VitalsBody.extend({
  visitId: z.string().uuid(),
  stage: z.enum(['check_in', 'pre_consultation', 'consultation']),
});

export const UpdateWorkflowConfigBody = z.object({
  version: z.number().int().min(1),
  vitalsMode: vitalsMode.optional(),
  vitalsRequiredParams: z.array(vitalParameter).max(VITAL_PARAMETERS.length).optional(),
  vitalsOptionalParams: z.array(vitalParameter).max(VITAL_PARAMETERS.length).optional(),
  paymentTiming: paymentTiming.optional(),
});

/** `branchId` absent means the organization-wide scope, which is a real scope, not a missing value. */
export const WorkflowConfigQuery = z.object({
  branchId: z.string().uuid().optional(),
});

export const VitalsQueueQuery = z.object({
  branchId: z.string().uuid().optional(),
  /** Only the visits still waiting for a reading. */
  pending: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const WorkflowConfigSchema = z
  .object({
    branchId: z.string().uuid().nullable(),
    branchName: z.string().nullable(),
    vitalsMode,
    vitalsRequiredParams: z.array(vitalParameter),
    vitalsOptionalParams: z.array(vitalParameter),
    paymentTiming,
    version: z.number().int(),
    isDefault: z.boolean(),
    inheritedFromOrganization: z.boolean(),
  })
  .openapi('HospitalWorkflowConfig');

export const VitalsRecordSchema = z
  .object({
    id: z.string().uuid(),
    visitId: z.string().uuid(),
    patientId: z.string().uuid(),
    stage: z.enum(['check_in', 'pre_consultation', 'consultation']),
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
    notes: z.string().nullable(),
    recordedBy: z.string().uuid().nullable(),
    recordedByName: z.string().nullable(),
    recordedAt: z.string(),
    version: z.number().int(),
  })
  .openapi('VitalsRecord');

export const VitalsRecordListSchema = z.array(VitalsRecordSchema).openapi('VitalsRecordList');

export const VitalsQueueEntrySchema = z
  .object({
    visitId: z.string().uuid(),
    tokenNumber: z.number().int(),
    visitNumber: z.string(),
    patientId: z.string().uuid(),
    patientName: z.string(),
    patientUhid: z.string(),
    providerName: z.string().nullable(),
    department: z.string().nullable(),
    checkedInAt: z.string(),
    latestVitals: VitalsRecordSchema.nullable(),
  })
  .openapi('VitalsQueueEntry');

export const VitalsQueueSchema = z.array(VitalsQueueEntrySchema).openapi('VitalsQueue');
