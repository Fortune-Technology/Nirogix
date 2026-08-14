import { registry } from '../../openapi/registry';
import { ErrorResponseSchema, PaginationQuerySchema } from '../../openapi/schemas';
import { AuditListResponseSchema } from './audit.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });

registry.registerPath({
  method: 'get',
  path: '/api/v1/audit',
  operationId: 'listAuditLog',
  tags: ['Audit'],
  summary: 'List the tenant audit trail (newest first)',
  description: 'Requires the `audit.log.view` permission. Append-only, immutable.',
  security: [{ bearerAuth: [] }],
  request: { query: PaginationQuerySchema },
  responses: {
    200: { description: 'Audit entries (paginated)', ...json(AuditListResponseSchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
    403: { description: 'Missing audit.log.view', ...json(ErrorResponseSchema) },
  },
});
