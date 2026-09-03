import { registry } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import { z } from '../../openapi/registry';
import { CreateDepartmentBody, UpdateDepartmentBody, DepartmentSchema } from './department.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const forbidden = {
  description: 'Missing platform.departments.manage',
  ...json(ErrorResponseSchema),
};

const DepartmentListSchema = z
  .object({ departments: z.array(DepartmentSchema) })
  .openapi('DepartmentList');

registry.registerPath({
  method: 'get',
  path: '/api/v1/departments',
  operationId: 'listDepartments',
  tags: ['Departments'],
  summary: 'List the hospital’s departments',
  description:
    'RLS-scoped to the caller’s tenant. `activeOnly=true` returns only active departments — what a booking or check-in screen wants. `providerCount` reports how many providers are assigned, so the effect of deactivating one is visible before it happens.',
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      activeOnly: z.coerce.boolean().optional(),
      branchId: z.string().uuid().optional(),
    }),
  },
  responses: {
    200: { description: 'Departments', ...json(DepartmentListSchema) },
    401: notAuthed,
    403: { description: 'Missing platform.departments.view', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/departments/{id}',
  operationId: 'getDepartment',
  tags: ['Departments'],
  summary: 'Get one department',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'Department', ...json(DepartmentSchema) },
    401: notAuthed,
    403: { description: 'Missing platform.departments.view', ...json(ErrorResponseSchema) },
    404: { description: 'Not found in this tenant', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/departments',
  operationId: 'createDepartment',
  tags: ['Departments'],
  summary: 'Create a department',
  description:
    '`code` is unique within the hospital and stored uppercase. `branchId` NULL means organization-wide. The branch and the head provider must belong to the caller’s own hospital.',
  security: [{ bearerAuth: [] }],
  request: { body: json(CreateDepartmentBody) },
  responses: {
    201: { description: 'Created', ...json(DepartmentSchema) },
    401: notAuthed,
    403: forbidden,
    409: { description: 'Code already in use', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/departments/{id}',
  operationId: 'updateDepartment',
  tags: ['Departments'],
  summary: 'Update a department, or activate / deactivate it',
  description:
    'Departments are never deleted — visits and encounters reference them, and last year’s register must still name the department it happened in. Deactivation is audited at notice level.',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(UpdateDepartmentBody) },
  responses: {
    200: { description: 'Updated', ...json(DepartmentSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Not found in this tenant', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});
