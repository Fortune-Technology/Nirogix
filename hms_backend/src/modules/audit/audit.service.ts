import { count, desc, eq } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { auditLog, type AuditLog } from '../../db/schema';
import { logger } from '../../config/logger';

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
        metadata: entry.metadata ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent?.slice(0, 300) ?? null,
      }),
    );
  } catch (err) {
    logger.error({ err, action: entry.action }, 'Failed to write audit log entry');
  }
}

export async function listAudit(
  tenantId: string,
  opts: { page: number; pageSize: number },
): Promise<{ rows: AuditLog[]; total: number }> {
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(auditLog)
      .where(eq(auditLog.tenantId, tenantId))
      .orderBy(desc(auditLog.createdAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize);
    const totalRow = await tx
      .select({ c: count() })
      .from(auditLog)
      .where(eq(auditLog.tenantId, tenantId));
    return { rows, total: Number(totalRow[0]?.c ?? 0) };
  });
}
