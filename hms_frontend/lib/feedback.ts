// Turns an API outcome into exactly one user-facing notification (ADR-026).
//
// This is the ONLY place the Portal decides what a user is told about a request.
// Pages never write `if (success) toast(...) / if (error) toast(...)` — they call
// the API client (lib/api.ts), which calls in here. Rules:
//
//   * Show the backend's own message when it gives us a usable one.
//   * Generic copy only as a fallback, and always for 5xx — a server-side message
//     may carry internals, so it is logged, never rendered.
//   * Never surface a stack trace, SQL, hostname, `details` payload, or PHI.
//
// See resources/rules.md → API Feedback & Notification Rules.

import { toast } from "@hms/ui";
import { ApiRequestError, NetworkError, TimeoutError } from "./apiErrors";

interface Described {
  title: string;
  description: string;
  /** Repeats collapse onto one toast (e.g. a dashboard firing several calls at once). */
  dedupeKey: string;
}

const GENERIC_FAILURE = "Something went wrong. Please try again, or contact support if it keeps happening.";

/** Backend messages are shown as-is; anything empty, opaque, or developer-shaped falls back. */
function usableMessage(message: string | undefined): string | null {
  if (!message) return null;
  const trimmed = message.trim();
  if (trimmed.length < 3 || trimmed.length > 300) return null;
  if (/^[A-Z0-9_]+$/.test(trimmed)) return null; // a bare error code, not a sentence
  if (/\b(at\s+\w+\.\w+|Error:|stack|ECONNREFUSED|ETIMEDOUT|SQLSTATE|syntax error)\b/i.test(trimmed)) return null;
  return trimmed;
}

/** Maps any thrown value to the copy the user sees. Never returns internals. */
export function describeError(err: unknown): Described {
  if (err instanceof TimeoutError) {
    return {
      title: "Request timed out",
      description: "The server took too long to respond. Check your connection and try again.",
      dedupeKey: "timeout",
    };
  }

  if (err instanceof NetworkError) {
    return {
      title: "Can't reach the server",
      description: "You appear to be offline, or the service is unavailable. Check your connection and try again.",
      dedupeKey: "network",
    };
  }

  if (err instanceof ApiRequestError) {
    const backend = usableMessage(err.message);

    if (err.status >= 500) {
      // The real message is logged for support; the user gets safe copy.
      return { title: "Server error", description: GENERIC_FAILURE, dedupeKey: `5xx:${err.status}` };
    }

    switch (err.status) {
      case 401:
        return {
          title: "Session expired",
          description: backend ?? "Your session has ended. Please sign in again.",
          dedupeKey: "401",
        };
      case 403:
        return {
          title: "Not permitted",
          description: backend ?? "You don't have permission to do that.",
          dedupeKey: `403:${err.code}`,
        };
      case 404:
        return {
          title: "Not found",
          description: backend ?? "That record no longer exists, or was never visible to you.",
          dedupeKey: `404:${err.code}`,
        };
      case 409:
        return {
          title: "Conflict",
          description: backend ?? "This record changed since you loaded it. Reload and try again.",
          dedupeKey: `409:${err.code}`,
        };
      case 422:
      case 400:
        return {
          title: "Check the details",
          description: backend ?? "Some of the information provided isn't valid.",
          dedupeKey: `validation:${err.code}:${backend ?? ""}`,
        };
      case 429:
        return {
          title: "Too many requests",
          description: backend ?? "Please wait a moment before trying again.",
          dedupeKey: "429",
        };
      default:
        return {
          title: "Request failed",
          description: backend ?? GENERIC_FAILURE,
          dedupeKey: `${err.status}:${err.code}`,
        };
    }
  }

  return { title: "Something went wrong", description: GENERIC_FAILURE, dedupeKey: "unknown" };
}

/** Raises the failure notification. Called by the API client — not from pages. */
export function notifyError(err: unknown): void {
  const { title, description, dedupeKey } = describeError(err);

  // Full detail goes to the console/error tracker, never to the screen.
  if (typeof console !== "undefined") console.error("[api]", err);

  const variant = err instanceof ApiRequestError && (err.status === 401 || err.status === 403) ? "warning" : "error";
  toast[variant]({ title, description, dedupeKey });
}

/** Raises the success notification for a state-changing call. */
export function notifySuccess(message: string): void {
  toast.success({ description: message });
}

/**
 * Picks the success copy: the backend's own `message` wins; otherwise the caller's
 * text (or a formatter that builds it from the response, for calls whose result is
 * worth stating — "Dispensed X × 2 · ₹120 added to the bill"); otherwise a neutral
 * default for the verb.
 */
export function successMessage(
  payload: unknown,
  fallback: string | ((payload: never) => string) | undefined,
  method: string,
): string {
  const fromApi =
    payload && typeof payload === "object" && "message" in payload
      ? usableMessage(String((payload as { message?: unknown }).message ?? ""))
      : null;
  if (fromApi) return fromApi;
  if (typeof fallback === "function") return (fallback as (p: unknown) => string)(payload);
  if (fallback) return fallback;
  return method === "DELETE" ? "Removed." : "Saved.";
}
