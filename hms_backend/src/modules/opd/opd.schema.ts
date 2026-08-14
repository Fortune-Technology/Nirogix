import { z } from '../../openapi/registry';

// ---- Requests --------------------------------------------------------------

export const CheckInBody = z
  .object({
    patientId: z.string().uuid(),
    appointmentId: z.string().uuid().nullable().optional(),
    providerId: z.string().uuid().nullable().optional(),
    branchId: z.string().uuid().nullable().optional(),
    department: z.string().max(80).nullable().optional(),
    reason: z.string().max(500).nullable().optional(),
    consultationFeePaise: z.number().int().min(0),
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
    date: z.string().optional(),
    status: z.enum(['checked_in', 'in_consultation', 'completed', 'cancelled']).optional(),
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
    status: z.string(),
    department: z.string().nullable(),
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
