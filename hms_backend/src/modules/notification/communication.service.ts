import { createHash, randomInt } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { env } from '../../config/env';
import { db } from '../../db/client';
import { runWithTenant } from '../../db/tenantContext';
import { tenants, tenantBranding } from '../../db/schema';
import { sendEmail, sendSms } from './notification.service';
import {
  DEFAULT_BRAND_COLOR,
  renderEmailTemplate,
  type EmailBrand,
  type EmailTemplateKey,
  type EmailTemplateDataMap,
} from './email';

/**
 * The one seam between the platform and a communication provider (ADR-059).
 *
 * Every message the product sends — email, SMS, and one-time codes — goes through this
 * service. MSG91 sits behind `notification.service`'s provider interface (ADR-016) and
 * nothing outside this module names it. A frontend never reaches a provider at all:
 * the path is Frontend → API → CommunicationService → provider.
 *
 * **Why OTP generation is ours rather than MSG91's managed flow.** The codes are
 * hashed at rest, single-use, expiring and rate-limited, and the identical code path
 * serves email and mobile — which the managed flow does not. Adopting MSG91's OTP
 * endpoints later changes the transport inside `sendOtp`/`verifyOtp` and nothing else,
 * which is the entire reason this seam exists.
 */

export type OtpChannel = 'sms' | 'email';

export interface OtpStore {
  /** Persist the hash. Storing the code itself would make a leaked table a live key. */
  save(input: {
    destination: string;
    channel: OtpChannel;
    codeHash: string;
    expiresAt: Date;
  }): Promise<void>;
  /** The newest unconsumed hash for this destination, with its expiry and attempt count. */
  findActive(input: {
    destination: string;
    channel: OtpChannel;
  }): Promise<{ id: string; codeHash: string; expiresAt: Date; attempts: number } | null>;
  /** Mark consumed. A code that verified once must never verify again. */
  consume(id: string): Promise<void>;
  /** Record a wrong guess, so brute force burns the code rather than only the clock. */
  recordFailedAttempt(id: string): Promise<void>;
}

/** Wrong guesses allowed before a code is dead, however much of its TTL remains. */
export const OTP_MAX_ATTEMPTS = 5;

/** Six digits, uniformly distributed. `randomInt` is CSPRNG-backed; `Math.random` is not. */
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** Ten minutes: long enough for a slow SMS, short enough that a shoulder-surfed code expires. */
export const OTP_TTL_MS = 10 * 60 * 1000;

export interface SendOtpInput {
  tenantId: string;
  channel: OtpChannel;
  destination: string;
  store: OtpStore;
  /** Shown to the person. Keep it short — an SMS is read on a lock screen. */
  purpose?: string;
}

/**
 * Generate, persist and deliver a one-time code.
 *
 * Returns nothing. A caller that wanted the code back would be a caller that could log
 * it, and the point of hashing at rest is defeated by a code that travelled through
 * application logs on its way out.
 */
export async function sendOtp(input: SendOtpInput): Promise<void> {
  const { tenantId, channel, destination, store, purpose } = input;
  const code = generateOtp();

  await store.save({
    destination,
    channel,
    codeHash: hashOtp(code),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });

  const what = purpose ? `${purpose} code` : 'verification code';

  if (channel === 'sms') {
    // This wording is the text registered on DLT against the NIROGX header
    // (docs/dlt-sms-onboarding.md §4) and must not drift from it: an Indian operator rejects a
    // message that does not match its registered template. That is also why `purpose` is not used
    // here — it would vary the text, and one registered template cannot cover a message that
    // changes per call. Only the code travels, as the flow's single variable; the template id and
    // that variable's name both come from configuration (ADR-016), because MSG91 assigns them.
    const body = `Your Nirogix verification code is ${code}. Valid for 10 minutes. Do not share it with anyone.`;
    await sendSms({
      tenantId,
      to: destination,
      body,
      templateId: env.MSG91_OTP_TEMPLATE_ID,
      variables: { [env.MSG91_OTP_TEMPLATE_VAR ?? 'var1']: code },
    });
  } else {
    // Email is not DLT-governed, so it keeps the friendlier, purpose-aware wording.
    const body = `Your Nirogix ${what} is ${code}. It expires in 10 minutes.`;
    await sendEmail({ tenantId, to: destination, subject: `Your Nirogix ${what}`, body });
  }
}

/**
 * Check a code and consume it on success.
 *
 * Compares hashes, never the codes themselves, and consumes on the way out so a
 * correct code cannot be replayed — including by whoever is racing the legitimate user.
 */
export async function verifyOtp(input: {
  channel: OtpChannel;
  destination: string;
  code: string;
  store: OtpStore;
}): Promise<boolean> {
  const active = await input.store.findActive({
    destination: input.destination,
    channel: input.channel,
  });
  if (!active) return false;
  if (active.expiresAt.getTime() < Date.now()) return false;
  if (active.attempts >= OTP_MAX_ATTEMPTS) return false;

  if (active.codeHash !== hashOtp(input.code)) {
    // Bounded brute force: a wrong guess spends one of the code's five lives.
    await input.store.recordFailedAttempt(active.id);
    return false;
  }

  await input.store.consume(active.id);
  return true;
}

/**
 * Issue a fresh code for the same destination.
 *
 * Deliberately identical to `sendOtp` rather than re-sending the previous code: the
 * old one may have reached the wrong device, and reissuing invalidates it by making a
 * newer one active. Rate limiting belongs at the route, where the caller is known.
 */
export async function resendOtp(input: SendOtpInput): Promise<void> {
  await sendOtp(input);
}

/**
 * The branding an email is dressed in: the tenant's accent + organization name, falling back to
 * the Nirogix default when the tenant has set no colour (or for platform mail). Deliberately does
 * NOT resolve the tenant logo — a logo is a short-lived signed URL that would be dead by the time
 * the email is opened, so emails brand through colour + wordmark, which never expire.
 */
async function resolveEmailBrand(tenantId: string): Promise<EmailBrand> {
  // Org name from the platform-managed `tenants` table (no RLS); accent from the org-wide
  // branding row (branch_id NULL) inside the tenant's own RLS context.
  const nameRow = (
    await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1)
  )[0];
  const brandRow = (
    await runWithTenant(tenantId, (tx) =>
      tx
        .select({ brandColor: tenantBranding.brandColor })
        .from(tenantBranding)
        .where(and(eq(tenantBranding.tenantId, tenantId), isNull(tenantBranding.branchId)))
        .limit(1),
    )
  )[0];
  return {
    brandColor: brandRow?.brandColor ?? DEFAULT_BRAND_COLOR,
    brandColorFg: '#ffffff',
    orgName: nameRow?.name ?? 'Nirogix',
  };
}

/**
 * Send one of the catalogued application emails (email/email-templates.ts). This is the ONE way
 * business logic sends a rich email: it renders the named template with the tenant's branding and
 * hands the HTML to `sendEmail`, which logs it, dedupes on `idempotencyKey`, and never throws on a
 * provider failure (delivery problems are logged, not surfaced to the caller). Business logic never
 * builds email HTML itself.
 */
export async function sendAppEmail<K extends EmailTemplateKey>(input: {
  tenantId: string;
  to: string;
  template: K;
  data: EmailTemplateDataMap[K];
  /** Same key ⇒ never sent twice (e.g. a retried event). */
  idempotencyKey?: string;
}): Promise<void> {
  const brand = await resolveEmailBrand(input.tenantId);
  const { subject, html } = renderEmailTemplate(input.template, input.data, brand);
  await sendEmail({
    tenantId: input.tenantId,
    to: input.to,
    subject,
    body: html,
    idempotencyKey: input.idempotencyKey,
    metadata: { emailTemplate: input.template },
  });
}

// Re-exported so a caller has one import for every channel, and no reason to reach
// past this service into the provider layer.
export { sendEmail, sendSms };
