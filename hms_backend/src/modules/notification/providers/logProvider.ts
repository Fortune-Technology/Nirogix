import { randomUUID } from 'node:crypto';
import { logger } from '../../../config/logger';
import type { EmailProvider, SmsProvider, EmailMessage, SmsMessage, SendResult } from './types';

// Development/default provider — logs the message instead of sending. Used whenever real provider
// credentials (MSG91) are not configured, so the whole notification path is exercisable locally
// and in CI without external calls or approvals.
export class LogEmailProvider implements EmailProvider {
  readonly name = 'log';
  async sendEmail(msg: EmailMessage): Promise<SendResult> {
    // The body is included so link-carrying emails (e.g. the password-reset link,
    // ADR-081) are actually exercisable in development. This provider only ever
    // runs when no real provider is configured — a production box with MSG91 set
    // never reaches this class, so no real message content lands in production logs.
    logger.info(
      { channel: 'email', to: msg.to, subject: msg.subject, body: msg.body },
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
