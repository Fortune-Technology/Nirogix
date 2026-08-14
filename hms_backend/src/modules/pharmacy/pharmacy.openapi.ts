import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import {
  CreateDrugBody,
  ReceiveStockBody,
  DispenseBody,
  DrugSchema,
  DrugListSchema,
  PendingPrescriptionListSchema,
  DispenseResultSchema,
} from './pharmacy.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const notEntitled = { description: 'Tenant not entitled to the pharmacy module', ...json(ErrorResponseSchema) };
const forbidden = { description: 'Missing permission', ...json(ErrorResponseSchema) };

registry.registerPath({
  method: 'get',
  path: '/api/v1/drugs',
  operationId: 'listDrugs',
  tags: ['Pharmacy'],
  summary: 'Drug master with on-hand stock + low-stock flag',
  security: [{ bearerAuth: [] }],
  request: { query: z.object({ search: z.string().optional() }) },
  responses: { 200: { description: 'Drugs', ...json(DrugListSchema) }, 401: notAuthed, 403: notEntitled },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/drugs',
  operationId: 'createDrug',
  tags: ['Pharmacy'],
  summary: 'Add a drug to the master',
  security: [{ bearerAuth: [] }],
  request: { body: json(CreateDrugBody) },
  responses: { 201: { description: 'Created drug', ...json(DrugSchema) }, 401: notAuthed, 403: forbidden, 422: { description: 'Validation error', ...json(ErrorResponseSchema) } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/drugs/{id}/stock',
  operationId: 'receiveStock',
  tags: ['Pharmacy'],
  summary: 'Receive stock into a drug (adds a batch)',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(ReceiveStockBody) },
  responses: {
    201: { description: 'Updated drug', ...json(DrugSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Drug not found', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/prescriptions/pending',
  operationId: 'pendingPrescriptions',
  tags: ['Pharmacy'],
  summary: 'Prescriptions awaiting dispense (the pharmacy worklist)',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Pending prescriptions', ...json(PendingPrescriptionListSchema) }, 401: notAuthed, 403: notEntitled },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dispense',
  operationId: 'dispense',
  tags: ['Pharmacy'],
  summary: 'Dispense a prescription (FEFO stock deduction; adds a pharmacy line to the visit invoice)',
  security: [{ bearerAuth: [] }],
  request: { body: json(DispenseBody) },
  responses: {
    201: { description: 'Dispense result', ...json(DispenseResultSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Prescription or drug not found', ...json(ErrorResponseSchema) },
    409: { description: 'Insufficient stock / already dispensed', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});
