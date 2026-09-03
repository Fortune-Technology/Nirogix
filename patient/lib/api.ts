// The patient portal's endpoint surface (ADR-052, ADR-054).
//
// The HTTP core — token handling, error classification, the one-notification-per-call
// rule — comes from `@hms/client`. What is here is only what a patient may call, and
// it is deliberately tiny: two unauthenticated sign-in calls and four reads. There is
// no write, and there is **no endpoint that grants access to anything** — a patient
// cannot link themselves to a hospital, which is what "no public signup" means
// structurally rather than as a missing button.

import type {
  Appointment,
  PublicRegistrationContext,
  PublicCheckinContext,
  InvoiceListItem,
  Paginated,
  PatientHospital,
  PatientLabReport,
  PatientPortalProfile,
  PatientSession,
} from '@hms/types';
import { createApiClient } from '@hms/client';

const client = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1',
});

const { request } = client;

export const apiClient = client;
export { ApiRequestError, NetworkError, TimeoutError } from '@hms/client';
export const { setAccessToken, getAccessToken } = client;

// ---- Sign in ---------------------------------------------------------------

type Contact = { mobile?: string; email?: string };

/**
 * Ask for a code. The server answers the same way whether or not the contact is
 * registered, so this resolves identically too — the screen must not imply otherwise.
 */
export async function requestCode(contact: Contact): Promise<void> {
  await request<void>('/patient/auth/request-code', {
    method: 'POST',
    body: contact,
    feedback: false,
  });
}

export async function verifyCode(contact: Contact, code: string): Promise<PatientSession> {
  // Sets an httpOnly, path-scoped refresh cookie as a side effect — never visible here.
  return request<PatientSession>('/patient/auth/verify', {
    method: 'POST',
    body: { ...contact, code },
    feedback: false,
  });
}

/**
 * Re-establish a session from the refresh cookie on a full reload.
 *
 * Resolves to `null` rather than throwing when there is no session: arriving with no
 * cookie is the ordinary case for a first visit, not an error worth a toast.
 */
export async function restoreSession(): Promise<PatientSession | null> {
  try {
    return await request<PatientSession>('/patient/auth/refresh', {
      method: 'POST',
      refreshOn401: false,
      feedback: false,
    });
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  try {
    await request<void>('/patient/auth/logout', { method: 'POST', feedback: false });
  } finally {
    setAccessToken(null);
  }
}

// ---- Reads -----------------------------------------------------------------

export async function myHospitals(): Promise<PatientHospital[]> {
  return (await request<{ hospitals: PatientHospital[] }>('/patient/hospitals')).hospitals;
}

export async function profile(tenantId: string): Promise<PatientPortalProfile> {
  return request<PatientPortalProfile>(`/patient/hospitals/${tenantId}/profile`);
}

export async function appointments(tenantId: string): Promise<Paginated<Appointment>> {
  return request<Paginated<Appointment>>(`/patient/hospitals/${tenantId}/appointments`);
}

export async function invoices(tenantId: string): Promise<Paginated<InvoiceListItem>> {
  return request<Paginated<InvoiceListItem>>(`/patient/hospitals/${tenantId}/invoices`);
}

export async function labReports(tenantId: string): Promise<PatientLabReport[]> {
  return (
    await request<{ reports: PatientLabReport[] }>(`/patient/hospitals/${tenantId}/lab-reports`)
  ).reports;
}

// ---- Public self-registration (ADR-056) ------------------------------------
//
// One of the two unauthenticated writes in this app (the other is the appointment
// request below, ADR-069) — the only places the patient portal touches a specific
// hospital without a session. The hospital is resolved by the **backend, from the
// token in the path** — never sent from here, which is what makes a QR for one
// hospital unable to register someone at another.
//
// Neither call creates a patient. A submission is a request the hospital's front desk
// reviews, so "no public signup" (ADR-052) still holds exactly as before.

export async function registrationContext(token: string): Promise<PublicRegistrationContext> {
  return request<PublicRegistrationContext>(`/public/registration/${encodeURIComponent(token)}`, {
    feedback: false,
  });
}

export type RegistrationSubmission = {
  firstName: string;
  lastName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  phone: string;
  email?: string | null;
  city?: string | null;
  note?: string | null;
};

export async function submitRegistration(
  token: string,
  body: RegistrationSubmission,
): Promise<void> {
  await request<void>(`/public/registration/${encodeURIComponent(token)}`, {
    method: 'POST',
    body,
    feedback: false,
  });
}

// ---- Public appointment requests (ADR-069) ----------------------------------
//
// The second — and only other — unauthenticated surface, held to exactly the same
// rules as registration: the hospital is resolved by the backend from the opaque
// token in the path, and a submission is a REQUEST the front desk converts. Nothing
// here books an appointment or creates a patient.

/** What the public booking form may show: a name, a city, and the pick-lists. */
export type PublicBookingContext = {
  hospitalName: string;
  city: string | null;
  enabled: boolean;
  departments: Array<{ id: string; name: string }>;
  providers: Array<{ id: string; fullName: string }>;
};

export async function getPublicBookingContext(token: string): Promise<PublicBookingContext> {
  return request<PublicBookingContext>(`/public/booking/${encodeURIComponent(token)}`, {
    feedback: false,
  });
}

export type BookingSubmission = {
  firstName: string;
  lastName?: string | null;
  phone: string;
  email?: string | null;
  /** ISO calendar date (`YYYY-MM-DD`) — a wish, not a slot. */
  preferredDate?: string | null;
  /** 24-hour `HH:mm` — a wish, not a slot. */
  preferredTime?: string | null;
  departmentId?: string | null;
  providerId?: string | null;
  note?: string | null;
};

export async function submitBookingRequest(token: string, body: BookingSubmission): Promise<void> {
  await request<void>(`/public/booking/${encodeURIComponent(token)}`, {
    method: 'POST',
    body,
    feedback: false,
  });
}

// ---- Self check-in (ADR-118) ------------------------------------------------
//
// The third public surface, and the same contract as the other two: the hospital is
// resolved from an opaque token in the path, and the reply is identical whatever
// happened — matched, unmatched, or a hospital that has this switched off. Neither call
// checks anybody in; the front desk confirms, which is also the identity check.

export async function checkinContext(token: string): Promise<PublicCheckinContext> {
  return request<PublicCheckinContext>(`/public/check-in/${encodeURIComponent(token)}`, {
    feedback: false,
  });
}

export async function announceArrival(token: string, phone: string): Promise<void> {
  await request<void>(`/public/check-in/${encodeURIComponent(token)}`, {
    method: 'POST',
    body: { phone },
    feedback: false,
  });
}
