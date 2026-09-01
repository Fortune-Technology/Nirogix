// Provider abstraction (ADR-007): no module ever imports a vendor SDK/API directly — they call
// NotificationService, which calls one of these providers. Swapping MSG91 for another vendor is a
// new adapter, not a change to any calling module.

export type Channel = 'email' | 'sms' | 'whatsapp';

export type SendResult = { provider: string; providerMessageId: string };

export type EmailMessage = { to: string; subject: string; body: string; from?: string };

// SMS to Indian numbers is DLT-template-based; `templateId` carries the registered DLT/provider
// template id when a real provider needs it, and `variables` the values the provider substitutes
// into that template. `body` stays the human-readable text: it is what gets logged, and what the
// dev provider prints. A DLT provider sends `variables` and ignores `body`, because the wording is
// fixed at registration and only the variable may change (ADR-016).
export type SmsMessage = {
  to: string;
  body: string;
  templateId?: string;
  variables?: Record<string, string>;
};

export interface EmailProvider {
  readonly name: string;
  sendEmail(msg: EmailMessage): Promise<SendResult>;
}

export interface SmsProvider {
  readonly name: string;
  sendSms(msg: SmsMessage): Promise<SendResult>;
}
