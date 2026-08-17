import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import {
  CreateTestBody,
  EnterResultBody,
  LabTestSchema,
  LabTestListSchema,
  LabOrderSchema,
  LabWorklistSchema,
} from './laboratory.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const notEntitled = { description: 'Tenant not entitled to the laboratory module', ...json(ErrorResponseSchema) };
const forbidden = { description: 'Missing permission', ...json(ErrorResponseSchema) };
const notFound = { description: 'Not found', ...json(ErrorResponseSchema) };

registry.registerPath({
  method: 'get',
  path: '/api/v1/lab-tests',
  operationId: 'listLabTests',
  tags: ['Laboratory'],
  summary: 'Lab test master',
  security: [{ bearerAuth: [] }],
  request: { query: z.object({ search: z.string().optional() }) },
  responses: { 200: { description: 'Tests', ...json(LabTestListSchema) }, 401: notAuthed, 403: notEntitled },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/lab-tests',
  operationId: 'createLabTest',
  tags: ['Laboratory'],
  summary: 'Add a lab test to the master',
  security: [{ bearerAuth: [] }],
  request: { body: json(CreateTestBody) },
  responses: { 201: { description: 'Created test', ...json(LabTestSchema) }, 401: notAuthed, 403: forbidden, 422: { description: 'Validation error', ...json(ErrorResponseSchema) } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/lab-orders',
  operationId: 'listLabOrders',
  tags: ['Laboratory'],
  summary: 'Lab worklist (orders from the EMR, with results)',
  security: [{ bearerAuth: [] }],
  request: { query: z.object({ status: z.string().optional(), patientId: z.string().uuid().optional() }) },
  responses: { 200: { description: 'Lab orders', ...json(LabWorklistSchema) }, 401: notAuthed, 403: notEntitled },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/lab-orders/{id}',
  operationId: 'getLabOrder',
  tags: ['Laboratory'],
  summary: 'A lab order with its result (the report)',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Lab order', ...json(LabOrderSchema) }, 401: notAuthed, 403: notEntitled, 404: notFound },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/lab-orders/{id}/collect',
  operationId: 'collectLabSample',
  tags: ['Laboratory'],
  summary: 'Mark the sample collected',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Updated order', ...json(LabOrderSchema) }, 401: notAuthed, 403: forbidden, 404: notFound, 409: { description: 'Invalid status transition', ...json(ErrorResponseSchema) } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/lab-orders/{id}/result',
  operationId: 'enterLabResult',
  tags: ['Laboratory'],
  summary: 'Enter a result (auto-flags vs the reference range; adds a lab line to the visit invoice)',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(EnterResultBody) },
  responses: {
    200: { description: 'Order with the result', ...json(LabOrderSchema) },
    401: notAuthed,
    403: forbidden,
    404: notFound,
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});
