import { z } from '../../openapi/registry';
import { VitalsBody } from '../workflow/workflow.schema';

// ---- Requests --------------------------------------------------------------

export const CheckInBody = z
  .object({
    patientId: z.string().uuid(),
    appointmentId: z.string().uuid().nullable().optional(),
    providerId: z.string().uuid().nullable().optional(),
    branchId: z.string().uuid().nullable().optional(),
    /** Deprecated free-text department — send `departmentId` instead (ADR-050). */
    department: z.string().max(80).nullable().optional(),
    departmentId: z.string().uuid().nullable().optional(),
    reason: z.string().max(2000).nullable().optional(),
    /** Optional override — omitted, the provider's configured default fee applies. */
    consultationFeePaise: z.number().int().min(0).nullable().optional(),
    /** Required whenever the amount differs from what the fee schedule calculated (ADR-117). */
    feeOverrideReason: z.string().max(300).nullable().optional(),
    /** Check in against a pending referral — patient/department/provider default from it. */
    referralId: z.string().uuid().nullable().optional(),
    /**
     * Readings taken at the desk. Accepted only when this hospital collects vitals during
     * check-in (ADR-113); the server checks the mode, so a client cannot opt itself in.
     */
    vitals: VitalsBody.nullable().optional(),
    /**
     * How the patient arrived (ADR-115). One workflow books and checks in; this is the variable
     * that distinguishes what it produced.
     */
    arrivalType: z.enum(['walk_in', 'appointment', 'follow_up']).nullable().optional(),
    /**
     * Check in under an existing open treatment case, or open a new one (ADR-116). Mutually
     * exclusive — sending both is a client that has not decided, and the service refuses rather
     * than guessing which was meant.
     */
    caseId: z.string().uuid().nullable().optional(),
    newCase: z
      .object({ title: z.string().min(2).max(200), notes: z.string().max(2000).nullable().optional() })
      .nullable()
      .optional(),
  })
  .openapi('CheckInBody');

export const UpdateVisitStatusBody = z
  .object({
    status: z.enum(['in_consultation', 'completed', 'cancelled']),
    version: z.number().int().optional(),
  })
  .openapi('UpdateVisitStatusBody');

export const ListVisitsQuery = z
  .object({
    branchId: z.string().uuid().optional(),
    providerId: z.string().uuid().optional(),
    patientId: z.string().uuid().optional(),
    date: z.string().optional(),
    status: z.enum(['checked_in', 'in_consultation', 'completed', 'cancelled']).optional(),
    /** "true" scopes the queue to the provider linked to the signed-in user (a doctor's own list). */
    mine: z.enum(['true', 'false']).optional(),
  })
  .openapi('ListVisitsQuery');

// ---- Responses -------------------------------------------------------------

export const VisitInvoiceSummarySchema = z
  .object({
    id: z.string(),
    invoiceNumber: z.string(),
    status: z.string(),
    totalPaise: z.number(),
    amountPaidPaise: z.number(),
    balancePaise: z.number(),
  })
  .openapi('VisitInvoiceSummary');

export const VisitSchema = z
  .object({
    id: z.string(),
    visitNumber: z.string(),
    tokenNumber: z.number(),
    visitDate: z.string(),
    visitType: z.string(),
    arrivalType: z.string(),
    caseId: z.string().uuid().nullable(),
    calculatedFeePaise: z.number().int().nullable(),
    feeOverrideReason: z.string().nullable(),
    caseNumber: z.string().nullable(),
    caseTitle: z.string().nullable(),
    status: z.string(),
    version: z.number(),
    department: z.string().nullable(),
    departmentId: z.string().nullable(),
    reason: z.string().nullable(),
    checkedInAt: z.string(),
    completedAt: z.string().nullable(),
    patientId: z.string(),
    patientName: z.string(),
    patientUhid: z.string(),
    providerId: z.string().nullable(),
    providerName: z.string().nullable(),
    appointmentId: z.string().nullable(),
    invoice: VisitInvoiceSummarySchema.nullable(),
  })
  .openapi('Visit');

export const VisitListSchema = z.array(VisitSchema).openapi('VisitList');
