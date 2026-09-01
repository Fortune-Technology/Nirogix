import { z } from '../../openapi/registry';

/**
 * The consultation fee schedule (ADR-117). Every dimension is optional, and omitting one means
 * "any" — that is what lets one table hold both "every follow-up is ₹200" and "Dr Sharma's first
 * visit is ₹800" without either being a special case.
 */
export const CreateFeeRuleBody = z
  .object({
    branchId: z.string().uuid().nullable().optional(),
    providerId: z.string().uuid().nullable().optional(),
    departmentId: z.string().uuid().nullable().optional(),
    arrivalType: z.enum(['walk_in', 'appointment', 'follow_up']).nullable().optional(),
    /** Paise, like every other amount in the product. Zero is legitimate — a free follow-up. */
    feePaise: z.number().int().min(0).max(100_000_000),
    label: z.string().max(200).nullable().optional(),
  })
  .openapi('CreateFeeRuleBody');

export const UpdateFeeRuleBody = z
  .object({
    version: z.number().int().min(1),
    feePaise: z.number().int().min(0).max(100_000_000).optional(),
    label: z.string().max(200).nullable().optional(),
    /** Retire a rule rather than deleting it — it explains invoices already raised. */
    isActive: z.boolean().optional(),
  })
  .openapi('UpdateFeeRuleBody');

export const ListFeeRulesQuery = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const PreviewFeeQuery = z.object({
  providerId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  arrivalType: z.enum(['walk_in', 'appointment', 'follow_up']).optional(),
  branchId: z.string().uuid().optional(),
});

export const FeeRuleSchema = z
  .object({
    id: z.string().uuid(),
    branchId: z.string().uuid().nullable(),
    branchName: z.string().nullable(),
    providerId: z.string().uuid().nullable(),
    providerName: z.string().nullable(),
    departmentId: z.string().uuid().nullable(),
    departmentName: z.string().nullable(),
    arrivalType: z.string().nullable(),
    feePaise: z.number().int(),
    isActive: z.boolean(),
    label: z.string().nullable(),
    specificity: z.number().int(),
    version: z.number().int(),
    createdAt: z.string(),
  })
  .openapi('ConsultationFeeRule');

export const FeeRuleListSchema = z.array(FeeRuleSchema).openapi('ConsultationFeeRuleList');

export const ResolvedFeeSchema = z
  .object({
    feePaise: z.number().int(),
    ruleId: z.string().uuid().nullable(),
    ruleLabel: z.string().nullable(),
    source: z.enum(['rule', 'provider_default', 'none']),
  })
  .openapi('ResolvedConsultationFee');
