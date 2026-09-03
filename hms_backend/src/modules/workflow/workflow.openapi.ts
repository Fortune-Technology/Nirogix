import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import {
  RecordVitalsBody,
  UpdateWorkflowConfigBody,
  VitalsQueueSchema,
  VitalsRecordListSchema,
  VitalsRecordSchema,
  WorkflowConfigSchema,
} from './workflow.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const forbidden = {
  description: 'Missing permission, module or capability',
  ...json(ErrorResponseSchema),
};
const invalid = { description: 'Validation failed', ...json(ErrorResponseSchema) };

const branchQuery = z.object({
  branchId: z
    .string()
    .uuid()
    .optional()
    .describe(
      'Omit for the organization-wide scope; supply a branch to read or override that hospital',
    ),
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/workflow-config',
  operationId: 'getWorkflowConfig',
  tags: ['Workflow configuration'],
  summary: 'How this hospital runs its workflow (vitals placement, payment timing)',
  description:
    'Resolves branch-then-organization, falling back to the platform defaults. `isDefault` and ' +
    '`inheritedFromOrganization` say where the answer came from, which is what an administrator ' +
    'needs before changing anything.',
  security: [{ bearerAuth: [] }],
  request: { query: branchQuery },
  responses: {
    200: { description: 'Effective configuration', ...json(WorkflowConfigSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Branch not found', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/workflow-config',
  operationId: 'updateWorkflowConfig',
  tags: ['Workflow configuration'],
  summary: 'Set the workflow configuration for the organization, or override it for one hospital',
  description:
    'Saving with a `branchId` creates that hospital an override rather than editing what it ' +
    'inherited. Optimistically locked: send the `version` you read.',
  security: [{ bearerAuth: [] }],
  request: { query: branchQuery, body: json(UpdateWorkflowConfigBody) },
  responses: {
    200: { description: 'Updated configuration', ...json(WorkflowConfigSchema) },
    401: notAuthed,
    403: forbidden,
    409: { description: 'Changed by someone else', ...json(ErrorResponseSchema) },
    422: invalid,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/vitals',
  operationId: 'recordVitals',
  tags: ['Vitals'],
  summary: 'Record one set of vitals against a visit',
  description:
    'Writes a new observation; readings are never edited in place, so a re-take keeps both numbers ' +
    'with who took each and when. The `stage` is checked against the hospital configuration — a ' +
    'hospital that does not collect vitals at the desk cannot be given desk readings by a client.',
  security: [{ bearerAuth: [] }],
  request: { body: json(RecordVitalsBody) },
  responses: {
    201: { description: 'Recorded', ...json(VitalsRecordSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Visit not found', ...json(ErrorResponseSchema) },
    409: {
      description: 'Not recordable at this stage for this hospital',
      ...json(ErrorResponseSchema),
    },
    422: invalid,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/visits/{visitId}/vitals',
  operationId: 'listVisitVitals',
  tags: ['Vitals'],
  summary: 'Every reading taken on a visit, newest first',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ visitId: z.string().uuid() }) },
  responses: {
    200: { description: 'Readings', ...json(VitalsRecordListSchema) },
    401: notAuthed,
    403: forbidden,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/vitals/queue',
  operationId: 'listVitalsQueue',
  tags: ['Vitals'],
  summary: 'Patients checked in and waiting for vitals',
  description:
    'Derived from the visits themselves, never stored: a visit is on the queue while it is checked ' +
    'in and no consultation has started. Meaningful under `vitalsMode: after_checkin`; empty ' +
    'otherwise.',
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      branchId: z.string().uuid().optional(),
      pending: z.enum(['true', 'false']).optional().describe('Only visits with no reading yet'),
    }),
  },
  responses: {
    200: { description: 'Queue', ...json(VitalsQueueSchema) },
    401: notAuthed,
    403: forbidden,
  },
});
