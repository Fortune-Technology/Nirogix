import { getJobRunner } from './runner';
import { sendEmail, sendSms } from '../modules/notification/notification.service';
import { performTransfer } from '../modules/abdm/dataTransfer.service';
import type { AbdmTransferJobData, NotificationJobData } from './types';

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

  // ABDM health-record transfer (ADR-091). On the queue because NHA allows twenty minutes and
  // building, encrypting and pushing a report takes real time — none of which should hold open the
  // connection the gateway used to ask. Only identifiers travel on the queue; the clinical data is
  // read when the job runs.
  runner.registerProcessor('abdm.transfer', async (data: AbdmTransferJobData) => {
    await performTransfer(data.tenantId, data.transferId);
  });
}
