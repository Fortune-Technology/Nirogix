// THE central catalogue of platform (in-app) messages — the copy a user sees in a toast after an
// important action (ADR-026 / ADR-057). One file a developer opens to review everything the product
// says back to a user on success.
//
// How it reaches the screen: a controller returns `{ message: MESSAGES.x.y, ... }`. The shared API
// client (`@hms/client` feedback.ts) prefers the backend's `message` over any inline frontend
// fallback, so a message defined ONCE here shows identically in every frontend (Portal, Patient,
// Admin) — the message is owned by the business action, not hardcoded per screen.
//
// Scope on purpose: only actions where the user genuinely benefits from confirmation are listed.
// Routine reads and low-value events deliberately have no message here (no notification spam).
// Emails are a SEPARATE channel — see `email/email-templates.ts`. Do not assume an action that
// emails also toasts, or vice-versa; each action wires only the channel(s) that make sense.

export const MESSAGES = {
  auth: {
    passwordChanged: 'Password changed. Sign in again with the new one.',
    passwordResetRequested: 'If that account exists, a reset link is on its way.',
    passwordResetDone: 'Password set. Sign in with your new password.',
  },
  tenant: {
    onboarded: 'Hospital onboarded. A welcome email with a set-password link was sent to the administrator.',
    statusChanged: 'Hospital status updated.',
  },
  user: {
    created: 'User added. A welcome email with a set-password link was sent.',
    createdNoEmail: 'User added.',
    updated: 'User updated.',
  },
  patient: {
    registered: 'Patient registered.',
  },
  appointment: {
    booked: 'Appointment booked.',
    cancelled: 'Appointment cancelled.',
  },
  billing: {
    paymentRecorded: 'Payment recorded.',
  },
  laboratory: {
    resultVerified: 'Result verified and released to the patient.',
  },
} as const;

export type MessageGroup = keyof typeof MESSAGES;
