// THE central catalogue of every application email (ADR-016 / ADR-059). One file a developer opens
// to see everything Nirogix can email, with realistic sample data for each. A template is pure:
// given typed data it returns a subject + structured `EmailContent`; the layout (`layout.ts`) turns
// that into branded HTML + a plain-text twin. Business logic never builds email HTML — it calls
// `sendAppEmail(template, data)` (communication.service), which renders through here.
//
// To add an email: add a key to `EmailTemplateDataMap`, then an entry to `EMAIL_TEMPLATES` with a
// `sample`. The preview UI (admin) and the render tests pick it up automatically.

import { env } from '../../../config/env';
import { renderEmail, type EmailBrand, type EmailContent, PLATFORM_BRAND } from './layout';

// Preview/sample deep links are built from the environment's own configured frontend origins —
// never a hardcoded production domain — so a preview shows the correct host in local, staging and
// production. Real emails already receive their links from the services (which build them from the
// same env values); these constants only power the sample data.
const PORTAL = env.PORTAL_URL.replace(/\/$/, '');
const PATIENT = env.PATIENT_URL.replace(/\/$/, '');

export type EmailCategory =
  'auth' | 'onboarding' | 'appointment' | 'billing' | 'laboratory' | 'patient';

/** The typed payload each template needs. Dates/money arrive pre-formatted (DD/MM/YYYY, ₹) — the
 *  caller formats with the platform's rules so a template never touches a date/number library. */
export interface EmailTemplateDataMap {
  auth_password_reset: { userName: string; orgName: string; resetUrl: string };
  auth_password_changed: { userName: string; orgName: string };
  onboarding_admin_welcome: {
    userName: string;
    orgName: string;
    setupUrl: string;
    loginUrl: string;
  };
  staff_welcome: {
    userName: string;
    orgName: string;
    roleName: string;
    setupUrl: string;
    loginUrl: string;
  };
  appointment_confirmed: {
    patientName: string;
    orgName: string;
    providerName: string;
    whenText: string;
    portalUrl?: string;
  };
  appointment_cancelled: {
    patientName: string;
    orgName: string;
    providerName: string;
    whenText: string;
    reason?: string;
  };
  payment_receipt: {
    patientName: string;
    orgName: string;
    invoiceNumber: string;
    amountText: string;
    method: string;
    whenText: string;
    portalUrl?: string;
  };
  lab_results_ready: { patientName: string; orgName: string; testName: string; portalUrl?: string };
  patient_welcome: { patientName: string; orgName: string; uhid: string; portalUrl?: string };
}

export type EmailTemplateKey = keyof EmailTemplateDataMap;

export interface EmailTemplateDef<K extends EmailTemplateKey> {
  key: K;
  /** Human name shown in the preview UI. */
  name: string;
  category: EmailCategory;
  /** One line: which action sends this. */
  description: string;
  subject: (d: EmailTemplateDataMap[K]) => string;
  build: (d: EmailTemplateDataMap[K]) => EmailContent;
  /** Realistic mock data — powers the preview and the render tests. */
  sample: EmailTemplateDataMap[K];
}

type Registry = { [K in EmailTemplateKey]: EmailTemplateDef<K> };

export const EMAIL_TEMPLATES: Registry = {
  auth_password_reset: {
    key: 'auth_password_reset',
    name: 'Password reset',
    category: 'auth',
    description: 'Sent when a user requests a password reset (Forgot password).',
    subject: () => 'Reset your Nirogix password',
    build: (d) => ({
      preheader: 'Reset your password — this link works once and expires in 30 minutes.',
      heading: 'Reset your password',
      greeting: `Hello ${d.userName},`,
      paragraphs: [
        `A password reset was requested for your Nirogix account at ${d.orgName}.`,
        'Choose a new password using the button below. The link works once and expires in 30 minutes.',
      ],
      button: { label: 'Reset password', url: d.resetUrl },
      footerNote:
        "If you didn't request this, you can safely ignore this email — your password stays unchanged.",
    }),
    sample: {
      userName: 'Asha Menon',
      orgName: 'City Care Hospital',
      resetUrl: `${PORTAL}/reset-password?token=sample`,
    },
  },

  auth_password_changed: {
    key: 'auth_password_changed',
    name: 'Password changed',
    category: 'auth',
    description: 'Security confirmation sent after a password is changed or reset.',
    subject: () => 'Your Nirogix password was changed',
    build: (d) => ({
      preheader: 'Your account password was just changed.',
      heading: 'Your password was changed',
      greeting: `Hello ${d.userName},`,
      paragraphs: [
        `The password for your Nirogix account at ${d.orgName} was just changed, and every session was signed out.`,
        'If this was you, no further action is needed.',
      ],
      footerNote:
        'If you did NOT change your password, contact your administrator immediately — your account may be at risk.',
    }),
    sample: { userName: 'Asha Menon', orgName: 'City Care Hospital' },
  },

  onboarding_admin_welcome: {
    key: 'onboarding_admin_welcome',
    name: 'Hospital welcome (admin)',
    category: 'onboarding',
    description: 'Sent to the first organization administrator when a hospital is onboarded.',
    subject: (d) => `${d.orgName} is ready on Nirogix`,
    build: (d) => ({
      preheader: `Set your password and sign in to ${d.orgName}.`,
      heading: `Welcome to Nirogix`,
      greeting: `Hello ${d.userName},`,
      paragraphs: [
        `${d.orgName} has been set up on Nirogix and you have been made its administrator.`,
        'Set your password using the button below, then sign in to invite your team and configure your hospital.',
      ],
      button: { label: 'Set your password', url: d.setupUrl },
      outro: [
        `The link expires in 7 days. After that, use "Forgot password" at ${d.loginUrl} to set it.`,
      ],
      footerNote:
        'You are receiving this because your hospital was onboarded to Nirogix by a platform operator.',
    }),
    sample: {
      userName: 'Dr. Rao',
      orgName: 'City Care Hospital',
      setupUrl: `${PORTAL}/reset-password?token=sample`,
      loginUrl: `${PORTAL}/login`,
    },
  },

  staff_welcome: {
    key: 'staff_welcome',
    name: 'Staff welcome',
    category: 'onboarding',
    description: 'Sent when an administrator adds a new staff user to a hospital.',
    subject: (d) => `You've been added to ${d.orgName} on Nirogix`,
    build: (d) => ({
      preheader: `Set your password to access ${d.orgName}.`,
      heading: `You've been added to ${d.orgName}`,
      greeting: `Hello ${d.userName},`,
      paragraphs: [
        `An administrator at ${d.orgName} has created a Nirogix account for you as ${d.roleName}.`,
        'Set your password using the button below, then sign in to get started.',
      ],
      button: { label: 'Set your password', url: d.setupUrl },
      outro: [
        `The link expires in 7 days. After that, use "Forgot password" at ${d.loginUrl} to set it.`,
      ],
      footerNote: `If you weren't expecting this, you can ignore this email or contact ${d.orgName}.`,
    }),
    sample: {
      userName: 'Priya Nair',
      orgName: 'City Care Hospital',
      roleName: 'Receptionist',
      setupUrl: `${PORTAL}/reset-password?token=sample`,
      loginUrl: `${PORTAL}/login`,
    },
  },

  appointment_confirmed: {
    key: 'appointment_confirmed',
    name: 'Appointment confirmed',
    category: 'appointment',
    description: 'Sent to the patient (when an email is on file) after an appointment is booked.',
    subject: (d) => `Appointment confirmed — ${d.orgName}`,
    build: (d) => ({
      preheader: `Your appointment with ${d.providerName} is confirmed.`,
      heading: 'Your appointment is confirmed',
      greeting: `Hello ${d.patientName},`,
      paragraphs: [`Your appointment at ${d.orgName} is confirmed.`],
      facts: [
        { label: 'Doctor', value: d.providerName },
        { label: 'When', value: d.whenText },
      ],
      button: d.portalUrl ? { label: 'View appointment', url: d.portalUrl } : undefined,
      outro: ['Please arrive 10 minutes early. To reschedule or cancel, contact the hospital.'],
    }),
    sample: {
      patientName: 'Ravi Sharma',
      orgName: 'City Care Hospital',
      providerName: 'Dr. Rao',
      whenText: '28/08/2026, 10:30 AM',
      portalUrl: `${PATIENT}/appointments`,
    },
  },

  appointment_cancelled: {
    key: 'appointment_cancelled',
    name: 'Appointment cancelled',
    category: 'appointment',
    description:
      'Sent to the patient (when an email is on file) after an appointment is cancelled.',
    subject: (d) => `Appointment cancelled — ${d.orgName}`,
    build: (d) => ({
      preheader: `Your appointment with ${d.providerName} has been cancelled.`,
      heading: 'Your appointment was cancelled',
      greeting: `Hello ${d.patientName},`,
      paragraphs: [`Your appointment at ${d.orgName} has been cancelled.`],
      facts: [
        { label: 'Doctor', value: d.providerName },
        { label: 'Was scheduled for', value: d.whenText },
        ...(d.reason ? [{ label: 'Reason', value: d.reason }] : []),
      ],
      outro: ['To book a new appointment, contact the hospital.'],
    }),
    sample: {
      patientName: 'Ravi Sharma',
      orgName: 'City Care Hospital',
      providerName: 'Dr. Rao',
      whenText: '28/08/2026, 10:30 AM',
      reason: 'Doctor unavailable',
    },
  },

  payment_receipt: {
    key: 'payment_receipt',
    name: 'Payment receipt',
    category: 'billing',
    description: 'Sent to the patient (when an email is on file) after a payment is recorded.',
    subject: (d) => `Payment receipt ${d.invoiceNumber} — ${d.orgName}`,
    build: (d) => ({
      preheader: `We've received your payment of ${d.amountText}.`,
      heading: 'Payment received',
      greeting: `Hello ${d.patientName},`,
      paragraphs: [`Thank you — ${d.orgName} has received your payment.`],
      facts: [
        { label: 'Invoice', value: d.invoiceNumber },
        { label: 'Amount paid', value: d.amountText },
        { label: 'Method', value: d.method },
        { label: 'Date', value: d.whenText },
      ],
      button: d.portalUrl ? { label: 'View invoice', url: d.portalUrl } : undefined,
      outro: [
        'This is a confirmation of payment. For a formal tax invoice, contact the hospital billing desk.',
      ],
    }),
    sample: {
      patientName: 'Ravi Sharma',
      orgName: 'City Care Hospital',
      invoiceNumber: 'INV-000042',
      amountText: '₹1,250.00',
      method: 'Cash',
      whenText: '26/08/2026, 04:15 PM',
      portalUrl: `${PATIENT}/billing`,
    },
  },

  lab_results_ready: {
    key: 'lab_results_ready',
    name: 'Lab results ready',
    category: 'laboratory',
    description: 'Sent to the patient when a lab report is verified and released to the portal.',
    subject: (d) => `Your lab results are ready — ${d.orgName}`,
    build: (d) => ({
      preheader: 'Your lab report has been released.',
      heading: 'Your lab results are ready',
      greeting: `Hello ${d.patientName},`,
      paragraphs: [
        `Your ${d.testName} report at ${d.orgName} has been reviewed and is now available.`,
        'For your privacy, results are not included in this email — view them securely in the patient portal.',
      ],
      button: d.portalUrl ? { label: 'View results', url: d.portalUrl } : undefined,
      outro: ['Please discuss your results with your doctor. Do not use them for self-diagnosis.'],
    }),
    sample: {
      patientName: 'Ravi Sharma',
      orgName: 'City Care Hospital',
      testName: 'Complete Blood Count',
      portalUrl: `${PATIENT}/reports`,
    },
  },

  patient_welcome: {
    key: 'patient_welcome',
    name: 'Patient welcome',
    category: 'patient',
    description:
      'Sent to a patient (when an email is provided) when their record is first created.',
    subject: (d) => `Welcome to ${d.orgName}`,
    build: (d) => ({
      preheader: `Your patient record has been created. UHID ${d.uhid}.`,
      heading: `Welcome to ${d.orgName}`,
      greeting: `Hello ${d.patientName},`,
      paragraphs: [`A patient record has been created for you at ${d.orgName}.`],
      facts: [{ label: 'Your UHID', value: d.uhid }],
      button: d.portalUrl ? { label: 'Open patient portal', url: d.portalUrl } : undefined,
      outro: ['Keep your UHID handy — it identifies you for appointments, billing and reports.'],
    }),
    sample: {
      patientName: 'Ravi Sharma',
      orgName: 'City Care Hospital',
      uhid: 'UHID-000123',
      portalUrl: PATIENT,
    },
  },
};

/** Render a template to `{ subject, html, text }` for delivery. */
export function renderEmailTemplate<K extends EmailTemplateKey>(
  key: K,
  data: EmailTemplateDataMap[K],
  brand: EmailBrand = PLATFORM_BRAND,
): { subject: string; html: string; text: string } {
  const def = EMAIL_TEMPLATES[key];
  const { html, text } = renderEmail(def.build(data), brand);
  return { subject: def.subject(data), html, text };
}

export interface EmailTemplateSummary {
  key: EmailTemplateKey;
  name: string;
  category: EmailCategory;
  description: string;
  subject: string;
}

/** The catalogue, for the preview UI. Subject is rendered from each template's sample data. */
export function listEmailTemplates(): EmailTemplateSummary[] {
  return (Object.keys(EMAIL_TEMPLATES) as EmailTemplateKey[]).map((key) => {
    const def = EMAIL_TEMPLATES[key];
    return {
      key,
      name: def.name,
      category: def.category,
      description: def.description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      subject: def.subject(def.sample as any),
    };
  });
}

/** Render a template from its own sample data — the preview + the render tests use this. */
export function renderEmailTemplateSample(key: EmailTemplateKey): {
  subject: string;
  html: string;
  text: string;
} {
  const def = EMAIL_TEMPLATES[key];
  // Sample emails brand from the sample org name so the preview shows a realistic tenant look.
  const orgName =
    'orgName' in def.sample
      ? String((def.sample as { orgName?: string }).orgName ?? 'Nirogix')
      : 'Nirogix';
  const brand: EmailBrand = { ...PLATFORM_BRAND, orgName };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderEmailTemplate(key, def.sample as any, brand);
}
