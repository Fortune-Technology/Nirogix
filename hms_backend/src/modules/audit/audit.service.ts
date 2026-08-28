import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, type SQL } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { auditLog, type AuditLog } from '../../db/schema';
import { logger } from '../../config/logger';
import { currentRequestId } from '../../http/requestContext';

export type AuditSeverity = 'info' | 'notice' | 'warning' | 'critical';

export type AuditEntry = {
  tenantId: string;
  actorUserId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  severity?: AuditSeverity;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
  /**
   * Correlation id. Defaults to the id of the request being served (ADR-082), so a
   * service-level audit written five calls deep still points at the log lines and the
   * error-tracker event for the same request without threading a parameter through.
   */
  requestId?: string | null;
};

// Writes one audit entry. Best-effort: a failed audit write is logged but never breaks the
// business operation (auditing must not take down the request path). Tenant-scoped write.
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await runWithTenant(entry.tenantId, (tx) =>
      tx.insert(auditLog).values({
        tenantId: entry.tenantId,
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        resourceType: entry.resourceType ?? null,
        resourceId: entry.resourceId ?? null,
        method: entry.method ?? null,
        path: entry.path ?? null,
        statusCode: entry.statusCode ?? null,
        severity: entry.severity ?? 'info',
        requestId: entry.requestId ?? currentRequestId() ?? null,
        metadata: entry.metadata ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent?.slice(0, 300) ?? null,
      }),
    );
  } catch (err) {
    logger.error({ err, action: entry.action }, 'Failed to write audit log entry');
  }
}

export type AuditListOptions = {
  page: number;
  pageSize: number;
  /** Free-text over action / path / resource type. */
  search?: string;
  /** One or more severities (multi-select faceted filter, ADR-063). */
  severity?: readonly AuditSeverity[];
  /** Inclusive date window over `created_at` (YYYY-MM-DD) — drives the end-of-day report. */
  from?: string;
  to?: string;
  sortBy?: 'createdAt' | 'action' | 'severity' | 'statusCode';
  sortDir?: 'asc' | 'desc';
};

// Sortable columns are allow-listed — a client can never sort by an arbitrary column.
const SORTABLE = {
  createdAt: auditLog.createdAt,
  action: auditLog.action,
  severity: auditLog.severity,
  statusCode: auditLog.statusCode,
} as const;

export async function listAudit(
  tenantId: string,
  opts: AuditListOptions,
): Promise<{ rows: AuditLog[]; total: number }> {
  return runWithTenant(tenantId, async (tx) => {
    const filters: SQL[] = [eq(auditLog.tenantId, tenantId)];
    if (opts.severity?.length) filters.push(inArray(auditLog.severity, opts.severity as string[]));
    if (opts.from) filters.push(gte(auditLog.createdAt, new Date(`${opts.from}T00:00:00.000Z`)));
    if (opts.to) filters.push(lte(auditLog.createdAt, new Date(`${opts.to}T23:59:59.999Z`)));
    if (opts.search?.trim()) {
      const term = `%${opts.search.trim()}%`;
      const match = or(
        ilike(auditLog.action, term),
        ilike(auditLog.path, term),
        ilike(auditLog.resourceType, term),
      );
      if (match) filters.push(match);
    }
    const where = and(...filters);

    const column = SORTABLE[opts.sortBy ?? 'createdAt'];
    const order = opts.sortDir === 'asc' ? asc(column) : desc(column);

    const rows = await tx
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(order)
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize);
    const totalRow = await tx.select({ c: count() }).from(auditLog).where(where);
    return { rows, total: Number(totalRow[0]?.c ?? 0) };
  });
}
