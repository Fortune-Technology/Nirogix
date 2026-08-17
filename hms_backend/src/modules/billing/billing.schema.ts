import { z } from '../../openapi/registry';

// ---- Requests --------------------------------------------------------------

export const LineItemInputSchema = z
  .object({
    itemType: z.string().min(1).max(30),
    description: z.string().min(1).max(300),
    quantity: z.number().int().positive().optional(),
    unitPricePaise: z.number().int().nonnegative(),
    taxRateBps: z.number().int().min(0).max(100000).optional(),
    sourceModule: z.string().max(30).nullable().optional(),
    sourceRef: z.string().uuid().nullable().optional(),
  })
  .openapi('InvoiceLineItemInput');

export const CreateInvoiceBody = z
  .object({
    patientId: z.string().uuid(),
    branchId: z.string().uuid().nullable().optional(),
    visitId: z.string().uuid().nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    lineItems: z.array(LineItemInputSchema).min(1),
  })
  .openapi('CreateInvoiceBody');

export const RecordPaymentBody = z
  .object({
    amountPaise: z.number().int().positive(),
    method: z.enum(['cash', 'upi', 'card', 'netbanking', 'other']),
    reference: z.string().max(120).nullable().optional(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .openapi('RecordPaymentBody');

const INVOICE_STATUSES = ['draft', 'partially_paid', 'paid', 'void'] as const;
type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/**
 * A single status or a comma-separated multi-select from the DataTable's faceted
 * filter (ADR-063): `status=paid,partially_paid` becomes `['paid','partially_paid']`.
 * Unknown values are dropped.
 */
const statusFilter = z
  .string()
  .optional()
  .transform((v): InvoiceStatus[] | undefined => {
    if (!v) return undefined;
    const vals = v
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is InvoiceStatus => (INVOICE_STATUSES as readonly string[]).includes(s));
    return vals.length ? vals : undefined;
  });

export const ListInvoicesQuery = z
  .object({
    patientId: z.string().uuid().optional(),
    status: statusFilter,
    // Invoice-total range, in paise, from the DataTable's amount filter (ADR-063).
    amountFrom: z.coerce.number().int().min(0).optional(),
    amountTo: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .openapi('ListInvoicesQuery');

// ---- Responses -------------------------------------------------------------

export const InvoiceLineItemSchema = z
  .object({
    id: z.string(),
    itemType: z.string(),
    description: z.string(),
    quantity: z.number(),
    unitPricePaise: z.number(),
    taxRateBps: z.number(),
    taxPaise: z.number(),
    lineTotalPaise: z.number(),
  })
  .openapi('InvoiceLineItem');

export const PaymentSchema = z
  .object({
    id: z.string(),
    amountPaise: z.number(),
    method: z.string(),
    reference: z.string().nullable(),
    status: z.string(),
    collectedAt: z.string(),
  })
  .openapi('Payment');

export const InvoiceSchema = z
  .object({
    id: z.string(),
    invoiceNumber: z.string(),
    status: z.string(),
    currency: z.string(),
    subtotalPaise: z.number(),
    taxPaise: z.number(),
    totalPaise: z.number(),
    amountPaidPaise: z.number(),
    balancePaise: z.number(),
    notes: z.string().nullable(),
    visitId: z.string().nullable(),
    patientId: z.string(),
    patientName: z.string(),
    patientUhid: z.string(),
    createdAt: z.string(),
    lineItems: z.array(InvoiceLineItemSchema),
    payments: z.array(PaymentSchema),
  })
  .openapi('Invoice');

export const InvoiceListItemSchema = z
  .object({
    id: z.string(),
    invoiceNumber: z.string(),
    status: z.string(),
    totalPaise: z.number(),
    amountPaidPaise: z.number(),
    balancePaise: z.number(),
    currency: z.string(),
    createdAt: z.string(),
    patientId: z.string(),
    patientName: z.string(),
    patientUhid: z.string(),
  })
  .openapi('InvoiceListItem');

export const InvoicesPageSchema = z
  .object({
    data: z.array(InvoiceListItemSchema),
    page: z.object({ number: z.number(), size: z.number(), total: z.number(), totalPages: z.number() }),
  })
  .openapi('InvoicesPage');
