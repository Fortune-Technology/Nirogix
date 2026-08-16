import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../modules/auth/tokens';
import { Errors } from './error';

// First link of the authorization chain: authenticated → (entitlement) → (permission) → logic.
// Verifies the Bearer access token and attaches the principal to req.auth. The tenant comes
// from the token (the authenticated session), never from client input.
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(Errors.unauthorized());
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const claims = verifyAccessToken(token);
    req.auth = { userId: claims.sub, tenantId: claims.tid, roles: claims.roles ?? [], impersonatedBy: claims.imp };
    next();
  } catch {
    next(Errors.unauthorized('Invalid or expired token'));
  }
}
