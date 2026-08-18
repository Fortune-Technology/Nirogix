"use client";

import type { ReactNode } from "react";
import { useCan } from "./auth";

/**
 * Permission guards, shared by every Nirogix frontend (ADR-054).
 *
 * Neither of these is a security boundary — the backend re-checks every action
 * independently (invariant #2). They exist so a user is not shown a control they
 * cannot use, and so a typed URL lands on a clear refusal instead of a broken screen.
 *
 * The 403 panel itself stays per app: each one sends the user somewhere different
 * (the Portal to its dashboard, the admin console to its overview), so the panel is
 * passed in rather than assumed here.
 */

/** Renders `children` only when the current user holds `perm`; otherwise `fallback`. */
export function Can({
  perm,
  children,
  fallback = null,
}: {
  perm: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return useCan(perm) ? <>{children}</> : <>{fallback}</>;
}

/** Page-level guard: renders the app's own forbidden panel when `perm` is missing. */
export function RequirePermission({
  perm,
  forbidden,
  children,
}: {
  perm: string;
  forbidden: ReactNode;
  children: ReactNode;
}) {
  return useCan(perm) ? <>{children}</> : <>{forbidden}</>;
}
