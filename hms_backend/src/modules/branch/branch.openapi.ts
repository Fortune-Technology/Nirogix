import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import { CreateBranchBody, UpdateBranchBody, BranchSchema, BranchesResponseSchema } from './branch.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const idParam = { params: z.object({ id: z.string().uuid() }) };
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const forbidden = { description: 'Missing permission', ...json(ErrorResponseSchema) };

registry.registerPath({
  method: 'get',
  path: '/api/v1/branches',
  operationId: 'listBranches',
  tags: ['Hospitals'],
  summary: 'List branches in the tenant',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Branches', ...json(BranchesResponseSchema) }, 401: notAuthed, 403: forbidden },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/branches',
  operationId: 'createBranch',
  tags: ['Hospitals'],
  summary: 'Create a branch',
  security: [{ bearerAuth: [] }],
  request: { body: json(CreateBranchBody) },
  responses: {
    201: { description: 'Created', ...json(BranchSchema) },
    401: notAuthed,
    403: forbidden,
    409: { description: 'Branch code already exists', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/branches/{id}',
  operationId: 'updateBranch',
  tags: ['Hospitals'],
  summary: 'Update a branch (name / active)',
  security: [{ bearerAuth: [] }],
  request: { ...idParam, body: json(UpdateBranchBody) },
  responses: {
    200: { description: 'Updated', ...json(BranchSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});
