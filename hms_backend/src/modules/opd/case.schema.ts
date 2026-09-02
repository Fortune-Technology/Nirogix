import { z } from '../../openapi/registry';

/**
 * Treatment cases (ADR-116). The title is deliberately free text and required: an untitled case is
 * unpickable at a desk three weeks later, which defeats the point of having one.
 */
export const OpenCaseBody = z
  .object({
    patientId: z.string().uuid(),
    title: z.string().min(2).max(200),
    departmentId: z.string().uuid().nullable().optional(),
    providerId: z.string().uuid().nullable().optional(),
    branchId: z.string().uuid().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    /**
     * What kind of episode this is (ADR-121), from this hospital's configured case types. It
     * prices every visit under the case, so it is a commercial fact as much as a clinical one.
     */
    caseType: z.string().max(40).nullable().optional(),
  })
  .openapi('OpenCaseBody');

export const UpdateCaseBody = z
  .object({
    version: z.number().int().min(1),
    title: z.string().min(2).max(200).optional(),
    departmentId: z.string().uuid().nullable().optional(),
    providerId: z.string().uuid().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    /** Correctable (ADR-060): a case that turns out to be an insurance claim is the ordinary case. */
    caseType: z.string().max(40).nullable().optional(),
  })
  .openapi('UpdateCaseBody');

export const CloseCaseBody = z
  .object({
    version: z.number().int().min(1),
    /** Required: "closed" with no reason is unreadable to whoever opens the chart next. */
    closeReason: z.string().min(2).max(300),
  })
  .openapi('CloseCaseBody');

export const ReopenCaseBody = z
  .object({ version: z.number().int().min(1) })
  .openapi('ReopenCaseBody');

export const ListCasesQuery = z.object({
  patientId: z.string().uuid().optional(),
  status: z.enum(['open', 'closed']).optional(),
});

export const CaseSchema = z
  .object({
    id: z.string().uuid(),
    caseNumber: z.string(),
    patientId: z.string().uuid(),
    patientName: z.string(),
    patientUhid: z.string(),
    title: z.string(),
    caseType: z.string().nullable(),
    status: z.string(),
    departmentId: z.string().uuid().nullable(),
    departmentName: z.string().nullable(),
    providerId: z.string().uuid().nullable(),
    providerName: z.string().nullable(),
    notes: z.string().nullable(),
    openedAt: z.string(),
    closedAt: z.string().nullable(),
    closeReason: z.string().nullable(),
    version: z.number().int(),
    visitCount: z.number().int(),
    lastVisitDate: z.string().nullable(),
  })
  .openapi('PatientCase');

export const CaseListSchema = z.array(CaseSchema).openapi('PatientCaseList');
