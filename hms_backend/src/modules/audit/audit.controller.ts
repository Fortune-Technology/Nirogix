import type { Request, Response } from 'express';
import { z } from '../../openapi/registry';
import { paginate } from '../../http/respond';
import { listAudit } from './audit.service';

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  /** Free-text over action / path / resource type. */
  search: z.string().trim().max(120).optional(),
  severity: z.enum(['info', 'notice', 'warning', 'critical']).optional(),
  sortBy: z.enum(['createdAt', 'action', 'severity', 'statusCode']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export async function listAuditLog(req: Request, res: Response): Promise<void> {
  const { page, pageSize, search, severity, sortBy, sortDir } = QuerySchema.parse(req.query);
  const { rows, total } = await listAudit(req.auth!.tenantId, {
    page,
    pageSize,
    search,
    severity,
    sortBy,
    sortDir,
  });
  const data = rows.map((r) => ({
    id: r.id,
    action: r.action,
    actorUserId: r.actorUserId,
    resourceType: r.resourceType,
    resourceId: r.resourceId,
    method: r.method,
    path: r.path,
    statusCode: r.statusCode,
    severity: r.severity,
    createdAt: r.createdAt.toISOString(),
  }));
  res.json(paginate(data, total, page, pageSize));
}
