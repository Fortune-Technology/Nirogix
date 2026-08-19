import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import { env } from '../../config/env';

// Access token: short-lived, sent as `Authorization: Bearer`. Carries the tenant so every
// downstream request scopes RLS from the *authenticated session*, never from client input.
/**
 * Which KIND of principal this token belongs to (ADR-052).
 *
 * `staff` is a `users` row inside a tenant. `patient` is a `patient_identity`, which
 * lives above the tenancy boundary and reaches into one tenant through a link. They
 * are different principals, not different roles: a patient can never be granted a
 * staff permission, and staff routes refuse a patient by TYPE rather than by an empty
 * permission set — so a future grant cannot accidentally open one.
 *
 * Absent on tokens issued before this existed; treated as `staff`.
 */
export type PrincipalType = 'staff' | 'patient';

export type AccessClaims = {
  sub: string;
  tid: string;
  roles: string[];
  /** Platform operator's user id when this is a support session (ADR-037). */
  imp?: string;
  /** Principal type (ADR-052). Undefined = staff, for tokens minted before the split. */
  pt?: PrincipalType;
};
// Refresh token: long-lived, httpOnly cookie. `sid` references the server-side session row.
export type RefreshClaims = {
  sub: string;
  tid: string;
  sid: string;
  /** Principal type (ADR-052). Undefined = staff. A patient refresh carries `patient`. */
  pt?: PrincipalType;
  /**
   * Per-issue nonce. Without it, rotation did not rotate: the payload was
   * `{sub, tid, sid}` plus a second-resolution `iat`, so two tokens minted in the same
   * second were byte-identical — the stored hash was replaced with the same value and a
   * previously issued refresh token stayed valid for its whole lifetime. A stolen token
   * could not be invalidated by the legitimate user simply continuing their session,
   * which is the one thing rotation exists to guarantee.
   */
  gen?: string;
};

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Every refresh token is unique, even two issued in the same second — see `gen` above.
 * The nonce is generated here rather than by callers so no call site can forget it.
 */
export function signRefreshToken(claims: RefreshClaims): string {
  return jwt.sign({ ...claims, gen: randomUUID() }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessClaims & jwt.JwtPayload;
}

export function verifyRefreshToken(token: string): RefreshClaims {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshClaims & jwt.JwtPayload;
}

// Password-reset token (ADR-081): short-lived, emailed as a link, stored server-side only as a
// SHA-256 hash. Carries `tid` so the unauthenticated consume route can verify the signature and
// enter the RLS tenant context from the CLAIMS — the same pattern as refresh. `prt` pins the
// type so an access or refresh token can never be replayed as a reset link (and vice versa:
// verifyAccessToken/verifyRefreshToken use different secrets or reject on shape, and this
// verifier explicitly requires `prt`).
export type PasswordResetClaims = {
  sub: string;
  tid: string;
  /** Discriminates this token type; required by the verifier. */
  prt: 'pwreset';
  /** Per-issue nonce, same reasoning as RefreshClaims.gen. */
  gen?: string;
};

const PASSWORD_RESET_TTL = '30m';

export function signPasswordResetToken(claims: Omit<PasswordResetClaims, 'prt' | 'gen'>): string {
  return jwt.sign({ ...claims, prt: 'pwreset', gen: randomUUID() }, env.JWT_REFRESH_SECRET, {
    expiresIn: PASSWORD_RESET_TTL,
  });
}

export function verifyPasswordResetToken(token: string): PasswordResetClaims {
  const claims = jwt.verify(token, env.JWT_REFRESH_SECRET) as PasswordResetClaims & jwt.JwtPayload;
  if (claims.prt !== 'pwreset') throw new Error('Not a password-reset token');
  return claims;
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
