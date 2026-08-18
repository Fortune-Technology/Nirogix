import { env } from '../../../config/env';
import type { EmailProvider, SmsProvider, EmailMessage, SmsMessage, SendResult } from './types';

// MSG91 adapters (ADR-016 — MSG91 for SMS/WhatsApp AND email). These are only selected when
// MSG91_API_KEY is set, so they are dormant in dev/CI. The HTTP shapes below follow MSG91's v5
// API and MUST be verified against current MSG91 docs + a live key before go-live (kept behind
// the abstraction so that verification is isolated to this file).

const MSG91_BASE = 'https://control.msg91.com/api/v5';

export class Msg91EmailProvider implements EmailProvider {
  readonly name = 'msg91';
  async sendEmail(msg: EmailMessage): Promise<SendResult> {
    const res = await fetch(`${MSG91_BASE}/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: env.MSG91_API_KEY ?? '' },
      body: JSON.stringify({
        recipients: [{ to: [{ email: msg.to }] }],
        from: { email: msg.from ?? env.MSG91_EMAIL_FROM },
        domain: env.MSG91_EMAIL_DOMAIN,
        subject: msg.subject,
        body: msg.body,
      }),
    });
    if (!res.ok) throw new Error(`MSG91 email failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { data?: { unique_id?: string } };
    return { provider: this.name, providerMessageId: data?.data?.unique_id ?? 'msg91' };
  }
}

export class Msg91SmsProvider implements SmsProvider {
  readonly name = 'msg91';
  async sendSms(msg: SmsMessage): Promise<SendResult> {
    // Indian SMS is DLT-template based — a registered template id is required.
    const res = await fetch(`${MSG91_BASE}/flow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: env.MSG91_API_KEY ?? '' },
      body: JSON.stringify({
        template_id: msg.templateId,
        sender: env.MSG91_SMS_SENDER_ID,
        recipients: [{ mobiles: msg.to, body: msg.body }],
      }),
    });
    if (!res.ok) throw new Error(`MSG91 sms failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { request_id?: string };
    return { provider: this.name, providerMessageId: data?.request_id ?? 'msg91' };
  }
}
