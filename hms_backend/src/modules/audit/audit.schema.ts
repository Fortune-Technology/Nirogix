import { z } from '../../openapi/registry';
import { PageMetaSchema } from '../../openapi/schemas';

export const AuditEntrySchema = z
  .object({
    id: z.string().uuid(),
    action: z.string().openapi({ example: 'auth.login.success' }),
    actorUserId: z.string().uuid().nullable(),
    resourceType: z.string().nullable(),
    resourceId: z.string().nullable(),
    method: z.string().nullable(),
    path: z.string().nullable(),
    statusCode: z.number().int().nullable(),
    severity: z.string().openapi({ example: 'info' }),
    // Correlates this row with the structured log and the error tracker (ADR-082).
    // Null on rows written before the column existed, and on events raised outside a request.
    requestId: z.string().nullable().openapi({ example: '0f5f3f2e-8a1b-4a58-9d3a-1f1f2d6f9b21' }),
    createdAt: z.string(),
  })
  .openapi('AuditEntry');

export const AuditListResponseSchema = z
  .object({ data: z.array(AuditEntrySchema), page: PageMetaSchema })
  .openapi('AuditListResponse');
