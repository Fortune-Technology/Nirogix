import type { Request, Response } from 'express';
import { z } from '../../openapi/registry';
import { paginate } from '../../http/respond';
import { listAudit } from './audit.service';

const SEVERITIES = ['info', 'notice', 'warning', 'critical'] as const;
type Severity = (typeof SEVERITIES)[number];

/**
 * A single severity or a comma-separated multi-select from the DataTable's faceted
 * filter (ADR-063): `severity=warning,critical` becomes `['warning','critical']`.
 * Unknown values are dropped.
 */
const severityFilter = z
  .string()
  .optional()
  .transform((v): Severity[] | undefined => {
    if (!v) return undefined;
    const vals = v
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is Severity => (SEVERITIES as readonly string[]).includes(s));
    return vals.length ? vals : undefined;
  });

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  /** Free-text over action / path / resource type. */
  search: z.string().trim().max(120).optional(),
  severity: severityFilter,
  /** Date window (inclusive) over `created_at`, e.g. an end-of-day report (YYYY-MM-DD). */
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sortBy: z.enum(['createdAt', 'action', 'severity', 'statusCode']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export async function listAuditLog(req: Request, res: Response): Promise<void> {
  const { page, pageSize, search, severity, from, to, sortBy, sortDir } = QuerySchema.parse(
    req.query,
  );
  const { rows, total } = await listAudit(req.auth!.tenantId, {
    page,
    pageSize,
    search,
    severity,
    from,
    to,
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
    requestId: r.requestId,
    createdAt: r.createdAt.toISOString(),
  }));
  res.json(paginate(data, total, page, pageSize));
}
