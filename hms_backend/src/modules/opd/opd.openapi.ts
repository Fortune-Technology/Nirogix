import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import { CheckInBody, UpdateVisitStatusBody, VisitSchema, VisitListSchema } from './opd.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const notEntitled = { description: 'Tenant not entitled to the OPD module', ...json(ErrorResponseSchema) };
const forbidden = { description: 'Missing permission', ...json(ErrorResponseSchema) };

registry.registerPath({
  method: 'get',
  path: '/api/v1/visits',
  operationId: 'listVisits',
  tags: ['OPD'],
  summary: "Today's OPD queue / token board (filter by branch / provider / date / status)",
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      branchId: z.string().uuid().optional(),
      providerId: z.string().uuid().optional(),
      date: z.string().optional(),
      status: z.string().optional(),
    }),
  },
  responses: { 200: { description: 'Visits (queue)', ...json(VisitListSchema) }, 401: notAuthed, 403: notEntitled },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/visits/{id}',
  operationId: 'getVisit',
  tags: ['OPD'],
  summary: 'Get a visit with its patient, provider and invoice summary',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'Visit', ...json(VisitSchema) },
    401: notAuthed,
    403: notEntitled,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/visits/check-in',
  operationId: 'checkInVisit',
  tags: ['OPD'],
  summary: 'Check a patient in — creates a visit + a draft consultation-fee invoice',
  security: [{ bearerAuth: [] }],
  request: { body: json(CheckInBody) },
  responses: {
    201: { description: 'Checked-in visit', ...json(VisitSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Patient / provider / appointment not found', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/visits/{id}/status',
  operationId: 'updateVisitStatus',
  tags: ['OPD'],
  summary: 'Advance a visit (checked_in → in_consultation → completed, or cancel)',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(UpdateVisitStatusBody) },
  responses: {
    200: { description: 'Updated visit', ...json(VisitSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
    409: { description: 'Invalid status transition / version conflict', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});
