import { registry } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import { EntitlementsResponseSchema, ModuleStubResponseSchema } from './entitlement.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });

registry.registerPath({
  method: 'get',
  path: '/api/v1/entitlements',
  operationId: 'listEntitlements',
  tags: ['Admin'],
  summary: "List the tenant's entitled modules",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Entitled module keys', ...json(EntitlementsResponseSchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/patients',
  operationId: 'listPatients',
  tags: ['Patients'],
  summary: 'Patient module (stub) — demonstrates auth → module → permission',
  description: 'Requires the `patient` module entitlement AND `patient.record.view`.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'OK', ...json(ModuleStubResponseSchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
    403: { description: 'Module not entitled, or missing permission', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/ipd/beds',
  operationId: 'listBeds',
  tags: ['IPD'],
  summary: 'IPD module (stub) — demonstrates requireModule gating',
  description: 'Requires the `ipd` module entitlement.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'OK', ...json(ModuleStubResponseSchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
    403: { description: 'Module not entitled', ...json(ErrorResponseSchema) },
  },
});
