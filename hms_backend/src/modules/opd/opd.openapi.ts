import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import { CheckInBody, UpdateVisitStatusBody, VisitSchema, VisitListSchema } from './opd.schema';
import {
  CaseListSchema,
  CaseSchema,
  CloseCaseBody,
  OpenCaseBody,
  ReopenCaseBody,
  UpdateCaseBody,
} from './case.schema';

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

// ---- Treatment cases (ADR-116) ---------------------------------------------

const caseTags = ['Treatment cases'];

registry.registerPath({
  method: 'get',
  path: '/api/v1/cases',
  operationId: 'listCases',
  tags: caseTags,
  summary: "A patient's treatment cases, open ones first",
  description:
    'The question asked at every check-in: what is this patient already being treated for? Filter ' +
    'by `patientId` and by `status`; omitting status returns closed cases too, because the chart ' +
    'shows history as well as what is live.',
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      patientId: z.string().uuid().optional(),
      status: z.enum(['open', 'closed']).optional(),
    }),
  },
  responses: { 200: { description: 'Cases', ...json(CaseListSchema) }, 401: notAuthed, 403: notEntitled },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/cases/{id}',
  operationId: 'getCase',
  tags: caseTags,
  summary: 'One case, with how many visits have been made under it',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'Case', ...json(CaseSchema) },
    401: notAuthed,
    403: notEntitled,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/cases',
  operationId: 'openCase',
  tags: caseTags,
  summary: 'Open a treatment case',
  description:
    'A patient may have several open cases at once — a long-term condition and a fresh injury are ' +
    'genuinely separate episodes — so a second case is never refused. Check-in can open one in the ' +
    'same transaction as the visit instead, which is the usual path.',
  security: [{ bearerAuth: [] }],
  request: { body: json(OpenCaseBody) },
  responses: {
    201: { description: 'Opened', ...json(CaseSchema) },
    401: notAuthed,
    403: notEntitled,
    422: { description: 'Validation failed', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/cases/{id}',
  operationId: 'updateCase',
  tags: caseTags,
  summary: 'Correct a case title, department, doctor or notes',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(UpdateCaseBody) },
  responses: {
    200: { description: 'Updated', ...json(CaseSchema) },
    401: notAuthed,
    403: notEntitled,
    409: { description: 'Changed by someone else', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/cases/{id}/close',
  operationId: 'closeCase',
  tags: caseTags,
  summary: 'Declare a course of treatment finished',
  description:
    'Refused while a visit under the case is still live — closing an episode with the patient in ' +
    'the waiting room is a mis-click or a race, and the alternative is a doctor opening a ' +
    'consultation on a case already declared finished. The reason is required: "closed" with no ' +
    'reason is unreadable to whoever opens the chart next. Never deletes anything.',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(CloseCaseBody) },
  responses: {
    200: { description: 'Closed', ...json(CaseSchema) },
    401: notAuthed,
    403: notEntitled,
    409: { description: 'Already closed, a live visit remains, or changed elsewhere', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/cases/{id}/reopen',
  operationId: 'reopenCase',
  tags: caseTags,
  summary: 'Resume a closed case',
  description:
    'Keeps every visit already under the case. The alternative — opening a second case for the ' +
    "same episode — splits a patient's history in two with no way to put it back together.",
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(ReopenCaseBody) },
  responses: {
    200: { description: 'Reopened', ...json(CaseSchema) },
    401: notAuthed,
    403: notEntitled,
    409: { description: 'Already open, or changed elsewhere', ...json(ErrorResponseSchema) },
  },
});
