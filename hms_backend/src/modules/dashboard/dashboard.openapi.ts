import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });

const OrgSummarySchema = z
  .object({
    users: z.number(),
    doctors: z.number(),
    branches: z.object({ total: z.number(), active: z.number() }),
    modules: z.array(z.string()),
    patients: z.number().nullable(),
    appointments: z.number().nullable(),
  })
  .openapi('OrgSummary');

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/summary',
  operationId: 'getOrgSummary',
  tags: ['Reports'],
  summary: "The caller's own-tenant dashboard roll-up (RLS-scoped)",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Org summary', ...json(OrgSummarySchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
  },
});
