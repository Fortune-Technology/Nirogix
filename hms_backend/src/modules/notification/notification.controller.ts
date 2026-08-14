import type { Request, Response } from 'express';
import { z } from '../../openapi/registry';
import { paginate } from '../../http/respond';
import { sendEmail, sendSms, listNotifications } from './notification.service';
import type { NotificationLog } from '../../db/schema';

function toEntry(r: NotificationLog) {
  return {
    id: r.id,
    channel: r.channel,
    recipient: r.recipient,
    templateKey: r.templateKey,
    subject: r.subject,
    status: r.status,
    provider: r.provider,
    providerMessageId: r.providerMessageId,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function sendTest(req: Request, res: Response): Promise<void> {
  const { channel, to, subject, body, idempotencyKey } = req.body as {
    channel: 'email' | 'sms';
    to: string;
    subject?: string;
    body: string;
    idempotencyKey?: string;
  };
  const tenantId = req.auth!.tenantId;
  const entry =
    channel === 'email'
      ? await sendEmail({ tenantId, to, subject, body, idempotencyKey })
      : await sendSms({ tenantId, to, body, idempotencyKey });
  res.status(201).json(toEntry(entry));
}

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function list(req: Request, res: Response): Promise<void> {
  const { page, pageSize } = QuerySchema.parse(req.query);
  const { rows, total } = await listNotifications(req.auth!.tenantId, { page, pageSize });
  res.json(paginate(rows.map(toEntry), total, page, pageSize));
}
