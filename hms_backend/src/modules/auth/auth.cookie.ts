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
