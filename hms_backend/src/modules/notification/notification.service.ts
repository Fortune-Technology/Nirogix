import { and, count, desc, eq } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { notificationLog, notificationTemplates, type NotificationLog } from '../../db/schema';
import { logger } from '../../config/logger';
import { getEmailProvider, getSmsProvider } from './providers';

// Minimal {{placeholder}} substitution — the same code renders whatever template a tenant has
// configured (feature configuration without a per-tenant code branch).
export function renderTemplate(
  template: string,
  data: Record<string, string | number> = {},
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => String(data[key] ?? ''));
}

async function findTemplate(tenantId: string, key: string, channel: string, locale = 'en') {
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(notificationTemplates)
      .where(
        and(
          eq(notificationTemplates.tenantId, tenantId),
          eq(notificationTemplates.key, key),
          eq(notificationTemplates.channel, channel),
          eq(notificationTemplates.locale, locale),
          eq(notificationTemplates.isActive, true),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  });
}

async function findByIdempotency(
  tenantId: string,
  key: string | undefined,
): Promise<NotificationLog | null> {
  if (!key) return null;
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(notificationLog)
      .where(and(eq(notificationLog.tenantId, tenantId), eq(notificationLog.idempotencyKey, key)))
      .limit(1);
    return rows[0] ?? null;
  });
}

async function writeLog(entry: typeof notificationLog.$inferInsert): Promise<NotificationLog> {
  return runWithTenant(entry.tenantId, async (tx) => {
    const rows = await tx.insert(notificationLog).values(entry).returning();
    return rows[0]!;
  });
}

type SendCommon = {
  tenantId: string;
  to: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

export async function sendEmail(
  params: SendCommon & {
    subject?: string;
    body?: string;
    templateKey?: string;
    data?: Record<string, string | number>;
  },
): Promise<NotificationLog> {
  const existing = await findByIdempotency(params.tenantId, params.idempotencyKey);
  if (existing) return existing; // idempotent — return the original, do not re-send

  let subject = params.subject ?? '';
  let body = params.body ?? '';
  if (params.templateKey) {
    const tpl = await findTemplate(params.tenantId, params.templateKey, 'email');
    if (!tpl) throw new Error(`Email template not found: ${params.templateKey}`);
    subject = renderTemplate(tpl.subject ?? '', params.data);
    body = renderTemplate(tpl.body, params.data);
  }

  const provider = getEmailProvider();
  let status = 'sent';
  let providerMessageId: string | null = null;
  let error: string | null = null;
  try {
    const result = await provider.sendEmail({ to: params.to, subject, body });
    providerMessageId = result.providerMessageId;
  } catch (err) {
    status = 'failed';
    error = (err as Error).message?.slice(0, 500) ?? 'unknown error';
    logger.error({ err }, 'Email send failed');
  }

  return writeLog({
    tenantId: params.tenantId,
    channel: 'email',
    recipient: params.to,
    templateKey: params.templateKey ?? null,
    subject,
    status,
    provider: provider.name,
    providerMessageId,
    error,
    idempotencyKey: params.idempotencyKey ?? null,
    metadata: params.metadata ?? null,
  });
}

export async function sendSms(
  params: SendCommon & {
    body?: string;
    templateKey?: string;
    templateId?: string;
    data?: Record<string, string | number>;
  },
): Promise<NotificationLog> {
  const existing = await findByIdempotency(params.tenantId, params.idempotencyKey);
  if (existing) return existing;

  let body = params.body ?? '';
  if (params.templateKey) {
    const tpl = await findTemplate(params.tenantId, params.templateKey, 'sms');
    if (!tpl) throw new Error(`SMS template not found: ${params.templateKey}`);
    body = renderTemplate(tpl.body, params.data);
  }

  const provider = getSmsProvider();
  let status = 'sent';
  let providerMessageId: string | null = null;
  let error: string | null = null;
  try {
    const result = await provider.sendSms({ to: params.to, body, templateId: params.templateId });
    providerMessageId = result.providerMessageId;
  } catch (err) {
    status = 'failed';
    error = (err as Error).message?.slice(0, 500) ?? 'unknown error';
    logger.error({ err }, 'SMS send failed');
  }

  return writeLog({
    tenantId: params.tenantId,
    channel: 'sms',
    recipient: params.to,
    templateKey: params.templateKey ?? null,
    status,
    provider: provider.name,
    providerMessageId,
    error,
    idempotencyKey: params.idempotencyKey ?? null,
    metadata: params.metadata ?? null,
  });
}

export async function listNotifications(
  tenantId: string,
  opts: { page: number; pageSize: number },
): Promise<{ rows: NotificationLog[]; total: number }> {
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(notificationLog)
      .where(eq(notificationLog.tenantId, tenantId))
      .orderBy(desc(notificationLog.createdAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize);
    const totalRow = await tx
      .select({ c: count() })
      .from(notificationLog)
      .where(eq(notificationLog.tenantId, tenantId));
    return { rows, total: Number(totalRow[0]?.c ?? 0) };
  });
}
