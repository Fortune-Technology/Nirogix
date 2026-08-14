import { randomUUID } from 'node:crypto';
import { logger } from '../../../config/logger';
import type { EmailProvider, SmsProvider, EmailMessage, SmsMessage, SendResult } from './types';

// Development/default provider — logs the message instead of sending. Used whenever real provider
// credentials (MSG91) are not configured, so the whole notification path is exercisable locally
// and in CI without external calls or approvals.
export class LogEmailProvider implements EmailProvider {
  readonly name = 'log';
  async sendEmail(msg: EmailMessage): Promise<SendResult> {
    logger.info(
      { channel: 'email', to: msg.to, subject: msg.subject },
      '[dev] email logged (not sent — no provider configured)',
    );
    return { provider: this.name, providerMessageId: `log-${randomUUID()}` };
  }
}

export class LogSmsProvider implements SmsProvider {
  readonly name = 'log';
  async sendSms(msg: SmsMessage): Promise<SendResult> {
    logger.info(
      { channel: 'sms', to: msg.to },
      '[dev] sms logged (not sent — no provider configured)',
    );
    return { provider: this.name, providerMessageId: `log-${randomUUID()}` };
  }
}
