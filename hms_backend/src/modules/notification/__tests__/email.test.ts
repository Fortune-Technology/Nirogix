import { describe, expect, test } from 'vitest';
import {
  EMAIL_TEMPLATES,
  listEmailTemplates,
  renderEmail,
  renderEmailTemplate,
  renderEmailTemplateSample,
  formatEmailDateTime,
  formatPaise,
  type EmailTemplateKey,
} from '../email';

// Pure render tests — no DB, always run. Guards the central email catalogue: every template must
// render a subject + valid HTML + a plain-text twin, and untrusted content must never become markup.

const KEYS = Object.keys(EMAIL_TEMPLATES) as EmailTemplateKey[];

describe('email layout', () => {
  test('renders a branded, self-contained HTML document', () => {
    const { html, text } = renderEmail(
      { heading: 'Hello', paragraphs: ['A line.'], button: { label: 'Go', url: 'https://x.example' } },
      { brandColor: '#123456', brandColorFg: '#ffffff', orgName: 'Acme Hospital' },
    );
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('#123456'); // brand colour applied
    expect(html).toContain('Acme Hospital'); // org wordmark
    expect(html).toContain('https://x.example'); // CTA
    expect(text).toContain('Hello');
    expect(text).toContain('Go: https://x.example');
  });

  test('escapes untrusted text so a name cannot inject markup', () => {
    const { html } = renderEmail({ heading: 'Hi', greeting: 'Hello <script>alert(1)</script>,' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('email templates catalogue', () => {
  test('every template lists with a rendered subject', () => {
    const list = listEmailTemplates();
    expect(list.length).toBe(KEYS.length);
    for (const item of list) {
      expect(item.subject.length).toBeGreaterThan(0);
      expect(item.name.length).toBeGreaterThan(0);
    }
  });

  test.each(KEYS)('template "%s" renders subject + html + text from sample data', (key) => {
    const { subject, html, text } = renderEmailTemplateSample(key);
    expect(subject.length).toBeGreaterThan(0);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<h1'); // a heading is always rendered
    expect(html.length).toBeGreaterThan(500);
    // The heading appears in the <title> (HTML-escaped there too, so compare escaped forms).
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain(EMAIL_TEMPLATES[key].build(EMAIL_TEMPLATES[key].sample as never).heading);
  });

  test('renderEmailTemplate applies the given brand', () => {
    const { html } = renderEmailTemplate(
      'auth_password_reset',
      { userName: 'Asha', orgName: 'Acme', resetUrl: 'https://p.example/reset' },
      { brandColor: '#0e7490', brandColorFg: '#fff', orgName: 'Acme' },
    );
    expect(html).toContain('https://p.example/reset');
    expect(html).toContain('#0e7490');
  });
});

describe('email formatting', () => {
  test('formats a date-time as DD/MM/YYYY, hh:mm AM/PM', () => {
    // Local time — construct with explicit local components to avoid TZ ambiguity.
    const d = new Date(2026, 7, 28, 14, 5); // 28 Aug 2026, 14:05 local
    expect(formatEmailDateTime(d)).toBe('28/08/2026, 02:05 PM');
  });

  test('formats midnight and noon correctly', () => {
    expect(formatEmailDateTime(new Date(2026, 0, 1, 0, 0))).toBe('01/01/2026, 12:00 AM');
    expect(formatEmailDateTime(new Date(2026, 0, 1, 12, 30))).toBe('01/01/2026, 12:30 PM');
  });

  test('formats paise as rupees with two decimals', () => {
    expect(formatPaise(125000)).toBe('₹1,250.00');
    expect(formatPaise(0)).toBe('₹0.00');
    expect(formatPaise(99)).toBe('₹0.99');
  });
});
