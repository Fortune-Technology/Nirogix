import { z } from '../../openapi/registry';

export const DateRangeQuery = z
  .object({ from: z.string(), to: z.string() })
  .openapi('DateRangeQuery');

export const OpdRegisterRowSchema = z
  .object({
    visitNumber: z.string(),
    tokenNumber: z.number(),
    visitDate: z.string(),
    patientName: z.string(),
    patientUhid: z.string(),
    providerName: z.string().nullable(),
    status: z.string(),
    checkedInAt: z.string(),
    invoiceNumber: z.string().nullable(),
    invoiceTotalPaise: z.number().nullable(),
    invoicePaidPaise: z.number().nullable(),
    invoiceStatus: z.string().nullable(),
  })
  .openapi('OpdRegisterRow');

export const OpdRegisterSchema = z.array(OpdRegisterRowSchema).openapi('OpdRegister');

export const CollectionsReportSchema = z
  .object({
    from: z.string(),
    to: z.string(),
    totalPaise: z.number(),
    count: z.number(),
    byMethod: z.array(z.object({ method: z.string(), totalPaise: z.number(), count: z.number() })),
    byDay: z.array(z.object({ date: z.string(), totalPaise: z.number(), count: z.number() })),
    rows: z.array(
      z.object({
        id: z.string(),
        collectedAt: z.string(),
        method: z.string(),
        amountPaise: z.number(),
        reference: z.string().nullable(),
        invoiceNumber: z.string(),
        patientName: z.string(),
        patientUhid: z.string(),
      }),
    ),
  })
  .openapi('CollectionsReport');

export const PendingLabRowSchema = z
  .object({
    testName: z.string(),
    testCode: z.string().nullable(),
    priority: z.string(),
    status: z.string(),
    patientName: z.string(),
    patientUhid: z.string(),
    orderedAt: z.string(),
  })
  .openapi('PendingLabRow');

export const PendingLabsSchema = z.array(PendingLabRowSchema).openapi('PendingLabs');
