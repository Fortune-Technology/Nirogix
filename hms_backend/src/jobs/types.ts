// Job payloads. Job "categories" from architecture.md (sync/async/scheduled/long-running/
// retryable) are options on the same runner, not separate infrastructure: async = default,
// scheduled = delaySeconds, retryable = BullMQ attempts+backoff.
export type NotificationJobData = {
  channel: 'email' | 'sms';
  tenantId: string;
  to: string;
  subject?: string;
  body?: string;
  templateKey?: string;
  idempotencyKey?: string;
};

export type JobName = 'notification.send';

export type JobDataMap = {
  'notification.send': NotificationJobData;
};
