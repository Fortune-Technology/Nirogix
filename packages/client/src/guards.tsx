'use client';

import type { ReactNode } from 'react';
import { permissionModuleKey } from '@hms/permissions';
import { useAuth, useCan } from './auth';

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

/**
 * Page-level guard, in the order the server enforces (ADR-126, mirroring ADR-085):
 *
 *   1. does the hospital have the module this permission belongs to?
 *   2. does this user hold the permission?
 *
 * The module check matters more now that an administrator holds nearly every permission
 * (ADR-125): without it, typing `/pharmacy/stock` in a hospital that has no Pharmacy module
 * would render the screen and let it fail against the API. The refusal panel asks the server
 * which of the two happened, so the message names the real problem.
 *
 * **A permission whose module is not in the registry is Platform Core** — patients, users,
 * branches, reports, audit — and is never module-gated.
 *
 * While the entitlement set is still loading it is EMPTY, and an empty set must not be read as
 * "this hospital has nothing": that would flash a refusal on every page of a healthy session.
 * The module check therefore applies only once something is known, exactly as the sidebar does.
 */
export function RequirePermission({
  perm,
  forbidden,
  children,
}: {
  perm: string;
  forbidden: ReactNode;
  children: ReactNode;
}) {
  const permitted = useCan(perm);
  const { modules, hasModule } = useAuth();
  const moduleKey = permissionModuleKey(perm);
  const moduleRefused = moduleKey !== null && modules.size > 0 && !hasModule(moduleKey);

  return permitted && !moduleRefused ? <>{children}</> : <>{forbidden}</>;
}
