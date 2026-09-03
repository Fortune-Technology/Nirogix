import { registry } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import {
  AccessExplainQuerySchema,
  AccessExplainResponseSchema,
  MyPermissionsResponseSchema,
  RolesResponseSchema,
} from './rbac.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });

registry.registerPath({
  method: 'get',
  path: '/api/v1/rbac/permissions',
  operationId: 'getMyPermissions',
  tags: ['RBAC'],
  summary: "Get the authenticated user's effective permissions",
  description: 'Union of role permissions plus grants, minus denies. `wildcard: true` = all.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Effective permissions', ...json(MyPermissionsResponseSchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/rbac/access',
  operationId: 'explainAccess',
  tags: ['RBAC'],
  summary: 'Explain whether the caller may use a permission, and why not',
  description:
    'Distinguishes a module the hospital does not have from a permission the role does not include, and names the roles in this hospital that grant it. Authenticated; no additional permission.',
  security: [{ bearerAuth: [] }],
  request: { query: AccessExplainQuerySchema },
  responses: {
    200: { description: 'Access explanation', ...json(AccessExplainResponseSchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/rbac/roles',
  operationId: 'listRoles',
  tags: ['RBAC'],
  summary: 'List the tenant roles',
  description: 'Requires the `platform.roles.view` permission.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Roles', ...json(RolesResponseSchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
    403: { description: 'Missing required permission', ...json(ErrorResponseSchema) },
  },
});
