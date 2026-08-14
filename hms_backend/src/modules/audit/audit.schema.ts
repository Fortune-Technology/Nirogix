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
    createdAt: z.string(),
  })
  .openapi('AuditEntry');

export const AuditListResponseSchema = z
  .object({ data: z.array(AuditEntrySchema), page: PageMetaSchema })
  .openapi('AuditListResponse');
