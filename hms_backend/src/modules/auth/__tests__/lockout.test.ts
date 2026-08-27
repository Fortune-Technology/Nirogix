import { describe, test, expect } from 'vitest';
import {
  CLEARED,
  LOCKOUT_ATTEMPT_WINDOW_MS,
  LOCKOUT_BASE_MS,
  LOCKOUT_MAX_MS,
  LOCKOUT_THRESHOLD,
  afterFailure,
  isAlerting,
  isLocked,
  lockDurationMs,
  lockMinutesRemaining,
  type LockoutState,
} from '../lockout';

// The lockout policy is pure (ADR-082) precisely so it can be tested without a database:
// every branch below is a rule the login path depends on.

const NOW = new Date('2026-08-20T10:00:00.000Z');
const fresh: LockoutState = { failedLoginAttempts: 0, failedLoginAt: null, lockedUntil: null };

describe('account lockout policy', () => {
  test('the first failures below the threshold do not lock', () => {
    let state = fresh;
    for (let i = 1; i < LOCKOUT_THRESHOLD; i += 1) {
      state = afterFailure(state, NOW);
      expect(state.failedLoginAttempts).toBe(i);
      expect(state.lockedUntil).toBeNull();
    }
  });

  test('the threshold failure locks for the base duration', () => {
    let state = fresh;
    for (let i = 0; i < LOCKOUT_THRESHOLD; i += 1) state = afterFailure(state, NOW);
    expect(state.failedLoginAttempts).toBe(LOCKOUT_THRESHOLD);
    expect(state.lockedUntil?.getTime()).toBe(NOW.getTime() + LOCKOUT_BASE_MS);
    expect(isLocked(state, NOW)).toBe(true);
  });

  test('each further failure doubles the lock, up to the ceiling', () => {
    expect(lockDurationMs(LOCKOUT_THRESHOLD)).toBe(LOCKOUT_BASE_MS);
    expect(lockDurationMs(LOCKOUT_THRESHOLD + 1)).toBe(LOCKOUT_BASE_MS * 2);
    expect(lockDurationMs(LOCKOUT_THRESHOLD + 2)).toBe(LOCKOUT_BASE_MS * 4);
    expect(lockDurationMs(LOCKOUT_THRESHOLD + 50)).toBe(LOCKOUT_MAX_MS);
    expect(lockDurationMs(LOCKOUT_THRESHOLD - 1)).toBe(0);
  });

  test('a lock expires on its own — nobody has to unlock the account', () => {
    let state = fresh;
    for (let i = 0; i < LOCKOUT_THRESHOLD; i += 1) state = afterFailure(state, NOW);
    const afterLock = new Date(NOW.getTime() + LOCKOUT_BASE_MS + 1);
    expect(isLocked(state, afterLock)).toBe(false);
    expect(lockMinutesRemaining(state, afterLock)).toBe(0);
  });

  test('a stale failure starts a new streak instead of counting toward the old one', () => {
    const old: LockoutState = {
      failedLoginAttempts: LOCKOUT_THRESHOLD - 1,
      failedLoginAt: new Date(NOW.getTime() - LOCKOUT_ATTEMPT_WINDOW_MS - 1000),
      lockedUntil: null,
    };
    const next = afterFailure(old, NOW);
    expect(next.failedLoginAttempts).toBe(1);
    expect(next.lockedUntil).toBeNull();
  });

  test('remaining minutes round up, so "0 minutes" is never shown to a locked user', () => {
    const state: LockoutState = {
      failedLoginAttempts: LOCKOUT_THRESHOLD,
      failedLoginAt: NOW,
      lockedUntil: new Date(NOW.getTime() + 1_000),
    };
    expect(lockMinutesRemaining(state, NOW)).toBe(1);
  });

  test('a sustained attempt escalates the audit severity', () => {
    expect(isAlerting(LOCKOUT_THRESHOLD)).toBe(false);
    expect(isAlerting(10)).toBe(true);
  });

  test('CLEARED is what a successful sign-in writes back', () => {
    expect(CLEARED).toEqual({ failedLoginAttempts: 0, failedLoginAt: null, lockedUntil: null });
    expect(isLocked(CLEARED, NOW)).toBe(false);
  });
});
