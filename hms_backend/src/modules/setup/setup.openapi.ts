import { registry } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import { SetupStatusSchema } from './setup.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });

registry.registerPath({
  method: 'get',
  path: '/api/v1/setup/status',
  operationId: 'getSetupStatus',
  tags: ['Config'],
  summary: 'How far the hospital’s configuration has got (Hospital Setup Console)',
  description:
    'Every step is computed from real tenant data, never stored as a flag, so it stays true when configuration is changed later. Module-specific steps appear only when the tenant is entitled to that module.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Setup status', ...json(SetupStatusSchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
    403: { description: 'Missing platform.organization.manage', ...json(ErrorResponseSchema) },
  },
});
