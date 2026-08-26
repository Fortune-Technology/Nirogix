import { getJobRunner } from './runner';
import { sendEmail, sendSms } from '../modules/notification/notification.service';
import type { NotificationJobData } from './types';

// Registers every job processor. Called once at startup (bootstrap.ts).
export function registerProcessors(): void {
  const runner = getJobRunner();

  // Async notification delivery — moves sending off the request path onto the queue.
  runner.registerProcessor('notification.send', async (data: NotificationJobData) => {
    if (data.channel === 'email') {
      await sendEmail({
        tenantId: data.tenantId,
        to: data.to,
        subject: data.subject,
        body: data.body,
        templateKey: data.templateKey,
        idempotencyKey: data.idempotencyKey,
      });
    } else {
      await sendSms({
        tenantId: data.tenantId,
        to: data.to,
        body: data.body,
        templateKey: data.templateKey,
        templateId: data.templateId,
        idempotencyKey: data.idempotencyKey,
      });
    }
  });
}
