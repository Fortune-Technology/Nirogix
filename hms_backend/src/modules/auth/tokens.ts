import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { env } from '../../config/env';

// Access token: short-lived, sent as `Authorization: Bearer`. Carries the tenant so every
// downstream request scopes RLS from the *authenticated session*, never from client input.
export type AccessClaims = {
  sub: string;
  tid: string;
  roles: string[];
  /** Platform operator's user id when this is a support session (ADR-037). */
  imp?: string;
};
// Refresh token: long-lived, httpOnly cookie. `sid` references the server-side session row.
export type RefreshClaims = { sub: string; tid: string; sid: string };

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(claims: RefreshClaims): string {
  return jwt.sign(claims, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessClaims & jwt.JwtPayload;
}

export function verifyRefreshToken(token: string): RefreshClaims {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshClaims & jwt.JwtPayload;
}

// The `exp` (seconds) embedded in a freshly signed token — used to set the session's expiry so
// the DB row and the JWT agree.
export function tokenExpiry(token: string): Date {
  const decoded = jwt.decode(token) as { exp: number } | null;
  return new Date((decoded?.exp ?? 0) * 1000);
}

// Refresh tokens are stored only as a SHA-256 hash, so a leaked session row is not a usable token.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
