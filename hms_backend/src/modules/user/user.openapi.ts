import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import {
  CreateUserBody,
  CreateUserResponseSchema,
  UpdateUserBody,
  UsersResponseSchema,
  UserDetailSchema,
  AssignRoleBody,
  SetOverrideBody,
  AckSchema,
} from './user.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const idParam = { params: z.object({ id: z.string().uuid() }) };
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const forbidden = { description: 'Missing permission', ...json(ErrorResponseSchema) };
const notFound = { description: 'Not found', ...json(ErrorResponseSchema) };
const invalid = { description: 'Validation error', ...json(ErrorResponseSchema) };

registry.registerPath({
  method: 'get',
  path: '/api/v1/users',
  operationId: 'listUsers',
  tags: ['Users'],
  summary: 'List users in the tenant (with role keys)',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Users', ...json(UsersResponseSchema) },
    401: notAuthed,
    403: forbidden,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/users',
  operationId: 'createUser',
  tags: ['Users'],
  summary: 'Create a staff user (optionally with a role); returns a one-time temp password',
  security: [{ bearerAuth: [] }],
  request: { body: json(CreateUserBody) },
  responses: {
    201: { description: 'Created', ...json(CreateUserResponseSchema) },
    401: notAuthed,
    403: forbidden,
    409: { description: 'Email already exists', ...json(ErrorResponseSchema) },
    422: invalid,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/users/{id}',
  operationId: 'getUser',
  tags: ['Users'],
  summary: 'Get a user with roles, effective permissions and overrides',
  security: [{ bearerAuth: [] }],
  request: idParam,
  responses: {
    200: { description: 'User', ...json(UserDetailSchema) },
    401: notAuthed,
    403: forbidden,
    404: notFound,
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/users/{id}',
  operationId: 'updateUser',
  tags: ['Users'],
  summary: "Update a user's status or name",
  security: [{ bearerAuth: [] }],
  request: { ...idParam, body: json(UpdateUserBody) },
  responses: {
    200: { description: 'Updated', ...json(AckSchema) },
    401: notAuthed,
    403: forbidden,
    404: notFound,
    422: invalid,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/users/{id}/roles',
  operationId: 'assignUserRole',
  tags: ['RBAC'],
  summary: 'Assign a role to a user',
  security: [{ bearerAuth: [] }],
  request: { ...idParam, body: json(AssignRoleBody) },
  responses: {
    201: { description: 'Assigned', ...json(AckSchema) },
    401: notAuthed,
    403: forbidden,
    422: invalid,
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/users/{id}/roles/{roleKey}',
  operationId: 'removeUserRole',
  tags: ['RBAC'],
  summary: 'Remove a role from a user',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid(), roleKey: z.string() }) },
  responses: {
    200: { description: 'Removed', ...json(AckSchema) },
    401: notAuthed,
    403: forbidden,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/users/{id}/overrides',
  operationId: 'addUserOverride',
  tags: ['RBAC'],
  summary: 'Add a permission override (GRANT/DENY, optionally time-bound). DENY always wins.',
  security: [{ bearerAuth: [] }],
  request: { ...idParam, body: json(SetOverrideBody) },
  responses: {
    201: { description: 'Added', ...json(AckSchema) },
    401: notAuthed,
    403: forbidden,
    422: invalid,
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/users/{id}/overrides/{overrideId}',
  operationId: 'revokeUserOverride',
  tags: ['RBAC'],
  summary: 'Revoke a permission override (soft — never deleted)',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid(), overrideId: z.string().uuid() }) },
  responses: {
    200: { description: 'Revoked', ...json(AckSchema) },
    401: notAuthed,
    403: forbidden,
  },
});
