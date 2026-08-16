import type { Response } from 'express';
import { isProd } from '../../config/env';
import { tokenExpiry } from './tokens';

export const REFRESH_COOKIE = 'hms_refresh';
/** Scoped to the auth routes so the cookie is only sent where it is needed. */
export const REFRESH_PATH = '/api/v1/auth';

/** One implementation, used by sign-in and by support sessions (ADR-037). */
export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: REFRESH_PATH,
    maxAge: Math.max(0, tokenExpiry(token).getTime() - Date.now()),
  });
}

/**
 * The patient portal's refresh cookie (ADR-052, F-8).
 *
 * A different name AND a different path from the staff cookie. The path is what matters:
 * `/api/v1/patient/auth` means a staff refresh cookie is never sent to a patient route
 * and a patient's is never sent to a staff one, so the two session models cannot be
 * confused for each other by the browser — a boundary the server would otherwise have to
 * re-establish on every request.
 */
export const PATIENT_REFRESH_COOKIE = 'hms_patient_refresh';
export const PATIENT_REFRESH_PATH = '/api/v1/patient/auth';

export function setPatientRefreshCookie(res: Response, token: string): void {
  res.cookie(PATIENT_REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: PATIENT_REFRESH_PATH,
    maxAge: Math.max(0, tokenExpiry(token).getTime() - Date.now()),
  });
}

export function clearPatientRefreshCookie(res: Response): void {
  res.clearCookie(PATIENT_REFRESH_COOKIE, { path: PATIENT_REFRESH_PATH });
}
