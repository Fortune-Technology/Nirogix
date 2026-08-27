// The single email layout (ADR-016 / ADR-059). Every application email is composed from this
// renderer — no module ever hand-writes email HTML. Emails are branded from the tenant's accent
// (falling back to the Nirogix default) and are table-based + inline-styled so they render in
// Outlook/Gmail/Apple Mail, and responsive so they read on a phone.
//
// Why no logo <img>: a tenant logo is served from a short-lived signed URL (branding.service),
// which would be expired by the time an email is opened. Emails therefore brand through the accent
// colour + the organization wordmark, which never rot. Body text is HTML-escaped — a patient or
// staff name is untrusted input and must never become markup.

/** The default Nirogix accent (packages/ui `--hms-brand`) — used when a tenant sets no colour. */
export const DEFAULT_BRAND_COLOR = '#0e7490';

export interface EmailBrand {
  /** Tenant accent (hex) or the Nirogix default. Drives the header band, button and links. */
  brandColor: string;
  /** Foreground on the accent — white in every current palette. */
  brandColorFg: string;
  /** Who the email is from in the header/footer — the hospital's name, or "Nirogix" for platform mail. */
  orgName: string;
}

export const PLATFORM_BRAND: EmailBrand = {
  brandColor: DEFAULT_BRAND_COLOR,
  brandColorFg: '#ffffff',
  orgName: 'Nirogix',
};

export interface EmailFact {
  label: string;
  value: string;
}

export interface EmailButton {
  label: string;
  url: string;
}

/** The structured content of an email — the layout turns this into HTML + a plain-text twin. */
export interface EmailContent {
  /** Hidden inbox-preview line (the grey text after the subject). Keep it short. */
  preheader?: string;
  /** The <h1> — the one thing the reader must take away. */
  heading: string;
  /** "Hello Asha," — omitted when there is no named recipient. */
  greeting?: string;
  /** Lead paragraphs, before any facts/button. */
  paragraphs?: string[];
  /** A key/value block (appointment time, amount, invoice number …). */
  facts?: EmailFact[];
  /** The single primary action. At most one — an email with two CTAs has none. */
  button?: EmailButton;
  /** Paragraphs after the button (e.g. "The link expires in 7 days."). */
  outro?: string[];
  /** Small print under the divider (e.g. "If you didn't request this, ignore this email."). */
  footerNote?: string;
}

/** HTML-escape untrusted text before it goes into the template. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'";

function paragraphHtml(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">${esc(text)}</p>`;
}

function factsHtml(facts: EmailFact[], brandColor: string): string {
  const rows = facts
    .map(
      (f) => `
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#64748b;width:40%;vertical-align:top;">${esc(f.label)}</td>
        <td style="padding:6px 0;font-size:14px;color:#0f172a;font-weight:600;">${esc(f.value)}</td>
      </tr>`,
    )
    .join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;border-left:3px solid ${brandColor};background:#f8fafc;border-radius:6px;">
      <tr><td style="padding:12px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      </td></tr>
    </table>`;
}

function buttonHtml(button: EmailButton, brand: EmailBrand): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
      <tr><td style="border-radius:8px;background:${brand.brandColor};">
        <a href="${esc(button.url)}" target="_blank" rel="noopener"
           style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;line-height:1;
                  color:${brand.brandColorFg};text-decoration:none;border-radius:8px;">
          ${esc(button.label)}
        </a>
      </td></tr>
    </table>`;
}

/**
 * Render an email to `{ html, text }`. The HTML is the branded document; the text is the
 * accessible/plain-client fallback built from the same content, so the two never drift.
 */
export function renderEmail(content: EmailContent, brand: EmailBrand = PLATFORM_BRAND): { html: string; text: string } {
  const preheader = content.preheader ?? '';
  const bodyParts: string[] = [];

  if (content.greeting) bodyParts.push(paragraphHtml(content.greeting));
  for (const p of content.paragraphs ?? []) bodyParts.push(paragraphHtml(p));
  if (content.facts?.length) bodyParts.push(factsHtml(content.facts, brand.brandColor));
  if (content.button) bodyParts.push(buttonHtml(content.button, brand));
  for (const p of content.outro ?? []) bodyParts.push(paragraphHtml(p));

  const footerNote = content.footerNote
    ? `<tr><td style="padding:0 32px 8px;">
         <p style="margin:16px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.6;color:#94a3b8;">
           ${esc(content.footerNote)}
         </p>
       </td></tr>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(content.heading)}</title>
<style>
  @media only screen and (max-width:600px) {
    .np-container { width:100% !important; }
    .np-pad { padding-left:20px !important; padding-right:20px !important; }
  }
  body { margin:0; padding:0; background:#eef2f5; }
</style>
</head>
<body style="margin:0;padding:0;background:#eef2f5;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f5;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" class="np-container" cellpadding="0" cellspacing="0"
             style="width:600px;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;
                    box-shadow:0 1px 3px rgba(15,23,42,0.08);font-family:${FONT_STACK};">
        <tr>
          <td style="background:${brand.brandColor};padding:20px 32px;">
            <span style="font-size:18px;font-weight:700;color:${brand.brandColorFg};letter-spacing:-0.01em;">
              ${esc(brand.orgName)}
            </span>
          </td>
        </tr>
        <tr>
          <td class="np-pad" style="padding:32px 32px 8px;">
            <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;color:#0f172a;font-weight:700;">
              ${esc(content.heading)}
            </h1>
            ${bodyParts.join('\n            ')}
          </td>
        </tr>
        ${footerNote}
        <tr>
          <td style="padding:24px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">
              This is an automated message from ${esc(brand.orgName)}${
                brand.orgName === 'Nirogix' ? '' : ', powered by Nirogix'
              }. Please do not reply to this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textParts: string[] = [content.heading, ''];
  if (content.greeting) textParts.push(content.greeting, '');
  for (const p of content.paragraphs ?? []) textParts.push(p, '');
  for (const f of content.facts ?? []) textParts.push(`${f.label}: ${f.value}`);
  if (content.facts?.length) textParts.push('');
  if (content.button) textParts.push(`${content.button.label}: ${content.button.url}`, '');
  for (const p of content.outro ?? []) textParts.push(p, '');
  if (content.footerNote) textParts.push(content.footerNote, '');
  textParts.push(`— ${brand.orgName}${brand.orgName === 'Nirogix' ? '' : ' (powered by Nirogix)'}`);

  return { html, text: textParts.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
}
