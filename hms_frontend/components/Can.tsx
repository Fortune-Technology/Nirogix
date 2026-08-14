"use client";

import type { ReactNode } from "react";
import { useCan } from "../lib/auth";
import { Forbidden } from "./Forbidden";

/**
 * Renders `children` only when the current user holds `perm`; otherwise renders
 * `fallback` (nothing by default). For hiding buttons/menu items. Not a security
 * boundary — the backend re-checks every action (invariant #2).
 */
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

/**
 * Page-level guard: shows the standard Forbidden panel when the user lacks `perm`.
 * Wrap a protected page's body with this so a permission-less user gets a clear 403
 * instead of a broken screen (the API would 403 the data calls anyway).
 */
export function RequirePermission({ perm, children }: { perm: string; children: ReactNode }) {
  return useCan(perm) ? <>{children}</> : <Forbidden />;
}
