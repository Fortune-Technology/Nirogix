import { registry } from '../../openapi/registry';
import { ErrorResponseSchema, PaginationQuerySchema } from '../../openapi/schemas';
import {
  SendTestBody,
  NotificationEntrySchema,
  NotificationListResponseSchema,
  QueuedResponseSchema,
} from './notification.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });

registry.registerPath({
  method: 'post',
  path: '/api/v1/notifications/test',
  operationId: 'sendNotification',
  tags: ['Notifications'],
  summary: 'Send a notification (email/SMS) via the configured provider',
  description:
    'In dev/CI (no MSG91 key) the message is logged by the dev provider, not actually sent. ' +
    'Requires the `notifications.send` permission. Supply `idempotencyKey` to make retries safe.',
  security: [{ bearerAuth: [] }],
  request: { body: json(SendTestBody) },
  responses: {
    201: { description: 'Notification sent (inline)', ...json(NotificationEntrySchema) },
    202: {
      description: 'Queued for background delivery (async=true)',
      ...json(QueuedResponseSchema),
    },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
    403: { description: 'Missing notifications.send', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/notifications',
  operationId: 'listNotifications',
  tags: ['Notifications'],
  summary: 'List the tenant notification log',
  description: 'Requires the `notifications.log.view` permission.',
  security: [{ bearerAuth: [] }],
  request: { query: PaginationQuerySchema },
  responses: {
    200: { description: 'Notification log (paginated)', ...json(NotificationListResponseSchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
    403: { description: 'Missing notifications.log.view', ...json(ErrorResponseSchema) },
  },
});
