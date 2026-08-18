import { z } from '../../openapi/registry';

// ---- Requests --------------------------------------------------------------

export const CreateReferralBody = z
  .object({
    visitId: z.string().uuid(),
    toDepartmentId: z.string().uuid(),
    toProviderId: z.string().uuid().nullable().optional(),
    reason: z.string().min(1).max(500),
  })
  .openapi('CreateReferralBody');

export const ListReferralsQuery = z
  .object({
    status: z.enum(['pending', 'completed', 'cancelled']).optional(),
    toDepartmentId: z.string().uuid().optional(),
    patientId: z.string().uuid().optional(),
  })
  .openapi('ListReferralsQuery');

// ---- Responses -------------------------------------------------------------

export const ReferralSchema = z
  .object({
    id: z.string(),
    visitId: z.string(),
    visitNumber: z.string(),
    patientId: z.string(),
    patientName: z.string(),
    patientUhid: z.string(),
    fromProviderId: z.string().nullable(),
    fromProviderName: z.string().nullable(),
    toDepartmentId: z.string(),
    toDepartmentName: z.string(),
    toProviderId: z.string().nullable(),
    toProviderName: z.string().nullable(),
    reason: z.string(),
    status: z.string(),
    resultingVisitId: z.string().nullable(),
    createdAt: z.string(),
    completedAt: z.string().nullable(),
  })
  .openapi('Referral');
export const ReferralListSchema = z.array(ReferralSchema).openapi('ReferralList');
