import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema, PaginationQuerySchema } from '../../openapi/schemas';
import { AuditListResponseSchema } from './audit.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });

registry.registerPath({
  method: 'get',
  path: '/api/v1/audit',
  operationId: 'listAuditLog',
  tags: ['Audit'],
  summary: 'List the tenant audit trail (newest first), with search, severity filter and sorting',
  description: 'Requires the `audit.log.view` permission. Append-only, immutable.',
  security: [{ bearerAuth: [] }],
  request: {
    query: PaginationQuerySchema.extend({
      search: z.string().max(120).optional().openapi({ description: 'Free-text over action / path / resource type' }),
      severity: z
        .string()
        .optional()
        .openapi({ description: 'Comma-separated severities (multi-select): info,notice,warning,critical' }),
      from: z.string().optional().openapi({ description: 'Inclusive lower bound over created_at (YYYY-MM-DD)' }),
      to: z.string().optional().openapi({ description: 'Inclusive upper bound over created_at (YYYY-MM-DD)' }),
      sortBy: z.enum(['createdAt', 'action', 'severity', 'statusCode']).optional().openapi({ description: 'Allow-listed sort column (default createdAt)' }),
      sortDir: z.enum(['asc', 'desc']).optional().openapi({ description: 'Sort direction (default desc)' }),
    }),
  },
  responses: {
    200: { description: 'Audit entries (paginated)', ...json(AuditListResponseSchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
    403: { description: 'Missing audit.log.view', ...json(ErrorResponseSchema) },
  },
});
