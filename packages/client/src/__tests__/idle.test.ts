import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVITY_STORAGE_KEY,
  DEFAULT_IDLE_TIMEOUT_MS,
  clearStoredActivity,
  isIdle,
  readStoredActivity,
  writeStoredActivity,
} from "../idle";

// The idle policy decides when a shared clinical workstation stops being signed in
// (ADR-082, SECURITY-AUDIT.md L-5). The hook itself needs a DOM; these cover the decision
// logic and the cross-tab stamp, which is where the subtle behaviour lives.

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
});

describe("idle policy", () => {
  it("defaults to a window long enough for a consultation, short enough to matter", () => {
    expect(DEFAULT_IDLE_TIMEOUT_MS).toBe(15 * 60_000);
  });

  it("is not idle while interaction is recent", () => {
    const now = 1_000_000;
    expect(isIdle(now - 60_000, DEFAULT_IDLE_TIMEOUT_MS, now)).toBe(false);
  });

  it("is idle once the window has passed with no interaction", () => {
    const now = 1_000_000;
    expect(isIdle(now - DEFAULT_IDLE_TIMEOUT_MS - 1, DEFAULT_IDLE_TIMEOUT_MS, now)).toBe(true);
  });

  it("counts activity from another tab, so one open tab keeps the session alive", () => {
    const now = 1_000_000;
    writeStoredActivity(now - 5_000);
    // This tab has been idle for far longer than the window; the other tab has not.
    expect(isIdle(now - DEFAULT_IDLE_TIMEOUT_MS - 1, DEFAULT_IDLE_TIMEOUT_MS, now)).toBe(false);
  });

  it("stores and clears the shared activity stamp", () => {
    writeStoredActivity(1234);
    expect(store.get(ACTIVITY_STORAGE_KEY)).toBe("1234");
    expect(readStoredActivity()).toBe(1234);
    clearStoredActivity();
    expect(readStoredActivity()).toBe(0);
  });

  it("ignores a corrupt stamp rather than trusting it", () => {
    store.set(ACTIVITY_STORAGE_KEY, "not-a-number");
    expect(readStoredActivity()).toBe(0);
    // A garbage stamp must not keep a session alive forever.
    const now = 1_000_000;
    expect(isIdle(now - DEFAULT_IDLE_TIMEOUT_MS - 1, DEFAULT_IDLE_TIMEOUT_MS, now)).toBe(true);
  });

  it("survives storage being unavailable (private mode, disabled cookies)", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
        removeItem: () => {
          throw new Error("denied");
        },
      },
    });
    expect(() => writeStoredActivity(1)).not.toThrow();
    expect(readStoredActivity()).toBe(0);
    expect(() => clearStoredActivity()).not.toThrow();
  });
});
