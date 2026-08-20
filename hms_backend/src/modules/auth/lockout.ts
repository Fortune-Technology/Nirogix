/**
 * Per-account brute-force lockout (ADR-082, SECURITY-AUDIT.md H-3).
 *
 * Rate limiting (ADR-036) is keyed by IP and by route, so it answers "is this
 * CALLER hammering us". It cannot answer "is this ACCOUNT being guessed at" — a
 * slow attempt spread across many addresses stays under every per-IP limit while
 * still working through a password list against one known email. This module is
 * the account-side half: consecutive failures are counted on the user row, and
 * once they cross a threshold the account is locked for a window that doubles
 * with each further failure.
 *
 * Deliberate properties:
 * - The streak EXPIRES. A failure older than `windowMs` starts a new count, so a
 *   user who mistypes their password once a month is never locked out.
 * - The lock is short and self-healing (60s → 15 min ceiling). Nobody has to call
 *   an administrator, and an attacker cannot use it to deny a real user service
 *   for long. The cost it imposes is on throughput, which is what defeats guessing.
 * - The lock is never extended by attempts made WHILE locked, so a third party who
 *   knows an email cannot hold the account shut indefinitely by attempting on a timer.
 * - Crossing the threshold is an audit event, and a persistent attempt escalates it
 *   to `critical` — the defender signal the audit trail was missing.
 */

/** Consecutive failures allowed before the first lock. */
export const LOCKOUT_THRESHOLD = 5;
/** A failure older than this no longer counts toward the current streak. */
export const LOCKOUT_ATTEMPT_WINDOW_MS = 15 * 60_000;
/** Lock length for the first lock; doubles per additional failure. */
export const LOCKOUT_BASE_MS = 60_000;
/** Ceiling, so a lock never becomes a denial of service against the real user. */
export const LOCKOUT_MAX_MS = 15 * 60_000;
/** Failures at or beyond this many make the audit event `critical`. */
export const LOCKOUT_ALERT_ATTEMPTS = 10;

/** The columns this policy reads and writes on the user row. */
export type LockoutState = {
  failedLoginAttempts: number;
  failedLoginAt: Date | null;
  lockedUntil: Date | null;
};

export function isLocked(state: LockoutState, now: Date = new Date()): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/** Whole minutes (rounded up, minimum 1) left on the lock — for the user-facing message. */
export function lockMinutesRemaining(state: LockoutState, now: Date = new Date()): number {
  if (!state.lockedUntil) return 0;
  const ms = state.lockedUntil.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.max(1, Math.ceil(ms / 60_000));
}

/** Exponential backoff from the failure count, capped. */
export function lockDurationMs(attempts: number): number {
  const steps = attempts - LOCKOUT_THRESHOLD;
  if (steps < 0) return 0;
  return Math.min(LOCKOUT_BASE_MS * 2 ** steps, LOCKOUT_MAX_MS);
}

/**
 * The state to persist after a failed sign-in. Pure — the caller writes it — so the
 * policy is testable without a database.
 */
export function afterFailure(state: LockoutState, now: Date = new Date()): LockoutState {
  const streakBroken =
    state.failedLoginAt !== null &&
    now.getTime() - state.failedLoginAt.getTime() > LOCKOUT_ATTEMPT_WINDOW_MS;
  const attempts = streakBroken ? 1 : state.failedLoginAttempts + 1;
  const lockMs = lockDurationMs(attempts);
  return {
    failedLoginAttempts: attempts,
    failedLoginAt: now,
    lockedUntil: lockMs > 0 ? new Date(now.getTime() + lockMs) : null,
  };
}

/** The state to persist once the user proves themselves (sign-in or completed reset). */
export const CLEARED: LockoutState = {
  failedLoginAttempts: 0,
  failedLoginAt: null,
  lockedUntil: null,
};

/** `true` once a failure count deserves a `critical` audit entry rather than a warning. */
export function isAlerting(attempts: number): boolean {
  return attempts >= LOCKOUT_ALERT_ATTEMPTS;
}
