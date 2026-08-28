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
  /** DLT/provider template id for Indian SMS (required by MSG91 once transactional SMS is live). */
  templateId?: string;
  idempotencyKey?: string;
};

/**
 * One ABDM health-information transfer (ADR-091).
 *
 * Queued rather than run inline because NHA allows 20 minutes and a large report can take real
 * time to build, encrypt and push — none of which should hold open the connection the gateway used
 * to ask. Only identifiers travel on the queue: the clinical data is read when the job runs, so a
 * queue backlog is never a pile of patient records sitting in Redis.
 */
export type AbdmTransferJobData = {
  tenantId: string;
  transferId: string;
};

export type JobName = 'notification.send' | 'abdm.transfer';

export type JobDataMap = {
  'notification.send': NotificationJobData;
  'abdm.transfer': AbdmTransferJobData;
};
