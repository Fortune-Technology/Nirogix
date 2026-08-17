import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import {
  CreateInvoiceBody,
  RecordPaymentBody,
  AddInvoiceLineBody,
  CreateServiceBody,
  UpdateServiceBody,
  ServiceSchema,
  ServiceListSchema,
  InvoiceSchema,
  InvoicesPageSchema,
} from './billing.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const notEntitled = { description: 'Tenant not entitled to the billing module', ...json(ErrorResponseSchema) };
const forbidden = { description: 'Missing permission', ...json(ErrorResponseSchema) };

registry.registerPath({
  method: 'post',
  path: '/api/v1/invoices/{id}/lines',
  operationId: 'addInvoiceLine',
  tags: ['Billing'],
  summary: 'Add a line to an invoice — a catalogue service (server-priced) or a custom one-off',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(AddInvoiceLineBody) },
  responses: {
    201: { description: 'Updated invoice', ...json(InvoiceSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Invoice or service not found', ...json(ErrorResponseSchema) },
    409: { description: 'Void invoice', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/services',
  operationId: 'listServices',
  tags: ['Billing'],
  summary: 'The services & packages catalogue (E-3) — priced items billing consumes',
  security: [{ bearerAuth: [] }],
  request: { query: z.object({ activeOnly: z.enum(['true', 'false']).optional(), search: z.string().optional() }) },
  responses: { 200: { description: 'Services', ...json(ServiceListSchema) }, 401: notAuthed, 403: forbidden },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/services',
  operationId: 'createService',
  tags: ['Billing'],
  summary: 'Add a service to the catalogue',
  security: [{ bearerAuth: [] }],
  request: { body: json(CreateServiceBody) },
  responses: {
    201: { description: 'Created service', ...json(ServiceSchema) },
    401: notAuthed,
    403: forbidden,
    409: { description: 'Code already exists', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/services/{id}',
  operationId: 'updateService',
  tags: ['Billing'],
  summary: 'Update or deactivate a catalogue service',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(UpdateServiceBody) },
  responses: {
    200: { description: 'Updated service', ...json(ServiceSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/invoices',
  operationId: 'listInvoices',
  tags: ['Billing'],
  summary: 'List invoices (filter by patient / status)',
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      patientId: z.string().uuid().optional(),
      status: z
        .string()
        .optional()
        .openapi({ description: 'Comma-separated statuses (multi-select): draft,partially_paid,paid,void' }),
      amountFrom: z.coerce.number().int().optional().openapi({ description: 'Invoice-total lower bound, in paise' }),
      amountTo: z.coerce.number().int().optional().openapi({ description: 'Invoice-total upper bound, in paise' }),
      page: z.coerce.number().int().optional(),
      pageSize: z.coerce.number().int().optional(),
    }),
  },
  responses: { 200: { description: 'Invoices', ...json(InvoicesPageSchema) }, 401: notAuthed, 403: notEntitled },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/invoices/{id}',
  operationId: 'getInvoice',
  tags: ['Billing'],
  summary: 'Get an invoice with its line items and payments (the receipt)',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'Invoice', ...json(InvoiceSchema) },
    401: notAuthed,
    403: notEntitled,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/invoices',
  operationId: 'createInvoice',
  tags: ['Billing'],
  summary: 'Create an invoice with line items',
  security: [{ bearerAuth: [] }],
  request: { body: json(CreateInvoiceBody) },
  responses: {
    201: { description: 'Created invoice', ...json(InvoiceSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Patient not found', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/invoices/{id}/payments',
  operationId: 'recordPayment',
  tags: ['Billing'],
  summary: 'Record a payment against an invoice (idempotent via idempotencyKey)',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(RecordPaymentBody) },
  responses: {
    201: { description: 'Updated invoice (with the new payment applied)', ...json(InvoiceSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Invoice not found', ...json(ErrorResponseSchema) },
    409: { description: 'Cannot collect against a void invoice', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});
