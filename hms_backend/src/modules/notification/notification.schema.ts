import { z } from '../../openapi/registry';
import { PageMetaSchema } from '../../openapi/schemas';

export const SendTestBody = z
  .object({
    channel: z.enum(['email', 'sms']),
    to: z.string().min(1).openapi({ example: 'patient@example.com' }),
    subject: z.string().optional().openapi({ example: 'Appointment reminder' }),
    body: z.string().min(1).openapi({ example: 'Your appointment is confirmed for 10:00 AM.' }),
    idempotencyKey: z.string().optional(),
    async: z
      .boolean()
      .optional()
      .openapi({ description: 'Deliver via the background job queue instead of inline' }),
  })
  .openapi('SendNotificationRequest');

export const NotificationEntrySchema = z
  .object({
    id: z.string().uuid(),
    channel: z.string(),
    recipient: z.string(),
    templateKey: z.string().nullable(),
    subject: z.string().nullable(),
    status: z.string().openapi({ example: 'sent' }),
    provider: z.string().nullable().openapi({ example: 'log' }),
    providerMessageId: z.string().nullable(),
    error: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('NotificationEntry');

export const NotificationListResponseSchema = z
  .object({ data: z.array(NotificationEntrySchema), page: PageMetaSchema })
  .openapi('NotificationListResponse');

export const QueuedResponseSchema = z.object({ queued: z.literal(true) }).openapi('QueuedResponse');
