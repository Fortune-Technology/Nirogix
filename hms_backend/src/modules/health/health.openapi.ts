import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';

// Documents the health endpoints (see ./health.routes.ts). This file is the TEMPLATE every
// module follows: define response/request schemas with Zod, then registry.registerPath(...)
// for each route. It is imported by src/openapi/register.ts so it runs at startup.

const HealthResponse = z
  .object({
    status: z.literal('ok'),
    service: z.string().openapi({ example: 'hms_backend' }),
    time: z.string().datetime().openapi({ example: '2026-08-13T07:52:16.368Z' }),
  })
  .openapi('HealthResponse');

const ReadyResponse = z
  .object({
    status: z.literal('ready'),
    db: z.literal('up'),
  })
  .openapi('ReadyResponse');

registry.registerPath({
  method: 'get',
  path: '/api/v1/health',
  operationId: 'getHealth',
  tags: ['Health'],
  summary: 'Liveness probe',
  description: 'Returns 200 when the API process is up. Touches no dependencies.',
  responses: {
    200: {
      description: 'Service is alive',
      content: { 'application/json': { schema: HealthResponse } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/health/ready',
  operationId: 'getReadiness',
  tags: ['Health'],
  summary: 'Readiness probe',
  description: 'Returns 200 when PostgreSQL is reachable, 503 otherwise.',
  responses: {
    200: {
      description: 'Ready',
      content: { 'application/json': { schema: ReadyResponse } },
    },
    503: {
      description: 'Not ready — database unreachable',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
