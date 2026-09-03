// Idle-session policy, shared by every authenticated Nirogix frontend (ADR-082,
// SECURITY-AUDIT.md L-5).
//
// A clinical workstation is not a personal laptop: it stands at a desk in a corridor, it is
// shared between shifts, and it gets walked away from mid-task. Access tokens are short-lived
// and held in memory, so the exposure was never a stolen token — it was the screen itself,
// left signed in and reachable by whoever sits down next. The fix is the ordinary one: after
// a period with no interaction, the session ends and the next person has to sign in.
//
// Cross-tab by design. Activity is written to `localStorage`, so a user reading a chart in one
// tab is not signed out by another tab's idle timer; whichever tab notices the whole browser
// has been idle is the one that ends the session.

import { useEffect, useRef } from 'react';

/** Default idle window. Long enough not to interrupt a consultation, short enough to matter. */
export const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60_000;

/** How often the timer checks. Cheap, and bounds how late a sign-out can be. */
export const IDLE_CHECK_INTERVAL_MS = 30_000;

/** Activity is persisted at most this often — a mousemove storm must not hit storage. */
export const ACTIVITY_WRITE_THROTTLE_MS = 10_000;

/** Shared across tabs of the same origin. */
export const ACTIVITY_STORAGE_KEY = 'hms-last-activity';

/** The interactions that count as "someone is still here". */
export const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/** Reads the newest activity stamp any tab has written; 0 when there is none or it is unusable. */
export function readStoredActivity(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(ACTIVITY_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    // Private mode, disabled storage: fall back to this tab's own in-memory stamp.
    return 0;
  }
}

export function writeStoredActivity(at: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACTIVITY_STORAGE_KEY, String(at));
  } catch {
    /* storage unavailable — the in-memory stamp still drives this tab */
  }
}

export function clearStoredActivity(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ACTIVITY_STORAGE_KEY);
  } catch {
    /* nothing to clean up */
  }
}

/** Has the whole browser been idle for longer than the window? */
export function isIdle(lastActivity: number, timeoutMs: number, now = Date.now()): boolean {
  const newest = Math.max(lastActivity, readStoredActivity());
  return now - newest >= timeoutMs;
}

/**
 * Ends the session after `timeoutMs` without interaction.
 *
 * One implementation for both principals: staff sign in through `AuthProvider`, patients
 * through the patient portal's own `SessionProvider` (ADR-052 keeps those separate on
 * purpose), but "a screen left open in a corridor" is the same risk on both, so the policy
 * is not written twice.
 *
 * `onIdle` is expected to revoke the session server-side, not merely forget it here.
 */
export function useIdleSignOut({
  active,
  timeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
  onIdle,
}: {
  active: boolean;
  timeoutMs?: number;
  onIdle: () => void | Promise<void>;
}): void {
  const handler = useRef(onIdle);
  handler.current = onIdle;

  useEffect(() => {
    if (!active || timeoutMs <= 0 || typeof window === 'undefined') return;

    let lastActivity = Date.now();
    let lastWrite = 0;
    let signingOut = false;
    writeStoredActivity(lastActivity);

    const markActivity = () => {
      const now = Date.now();
      lastActivity = now;
      // Throttled: an active user generates hundreds of these a minute.
      if (now - lastWrite >= ACTIVITY_WRITE_THROTTLE_MS) {
        lastWrite = now;
        writeStoredActivity(now);
      }
    };

    const check = () => {
      if (signingOut || !isIdle(lastActivity, timeoutMs)) return;
      signingOut = true;
      void Promise.resolve(handler.current()).finally(clearStoredActivity);
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActivity, { passive: true });
    }
    // Returning to the tab is the moment a long absence is most likely to be discovered.
    document.addEventListener('visibilitychange', check);
    const interval = window.setInterval(check, IDLE_CHECK_INTERVAL_MS);

    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, markActivity);
      document.removeEventListener('visibilitychange', check);
      window.clearInterval(interval);
    };
  }, [active, timeoutMs]);
}
