import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../modules/auth/tokens';
import { Errors } from './error';

/**
 * First link of the authorization chain: authenticated → (entitlement) → (permission) → logic.
 *
 * Verifies the Bearer access token and attaches the principal to `req.auth`. The tenant
 * comes from the token (the authenticated session), never from client input.
 *
 * **`requireAuth` means STAFF (ADR-052).** A patient principal is refused here, by
 * principal type, before any permission is consulted. That is deliberate: refusing by
 * type rather than by an empty permission set means a future permission grant — or a
 * mistaken override — cannot open a staff route to a patient. Patient routes use
 * `requirePatientAuth` instead, and nothing composes both.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const claims = readClaims(req);
  if (!claims) return next(Errors.unauthorized());
  if (claims.pt === 'patient') {
    // Not "forbidden" — from a staff route's point of view this principal has no
    // business here at all, and the response says nothing about what exists.
    return next(Errors.unauthorized());
  }
  req.auth = {
    userId: claims.sub,
    tenantId: claims.tid,
    roles: claims.roles ?? [],
    impersonatedBy: claims.imp,
    principalType: 'staff',
  };
  next();
}

/**
 * The patient portal's gate (ADR-052). Accepts **only** a patient principal, so a staff
 * token cannot read the patient endpoints either — the boundary refuses in both
 * directions rather than trusting that staff would not.
 *
 * `tenantId` on the request is the hospital the patient is currently viewing, which the
 * patient module resolves from an ACTIVE link and re-checks per request. It is never
 * taken from a URL or a header.
 */
export function requirePatientAuth(req: Request, _res: Response, next: NextFunction): void {
  const claims = readClaims(req);
  if (!claims) return next(Errors.unauthorized());
  if (claims.pt !== 'patient') return next(Errors.unauthorized());
  req.auth = {
    userId: claims.sub,
    tenantId: claims.tid,
    roles: [],
    principalType: 'patient',
  };
  next();
}

function readClaims(req: Request): ReturnType<typeof verifyAccessToken> | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  try {
    return verifyAccessToken(token);
  } catch {
    return null;
  }
}
