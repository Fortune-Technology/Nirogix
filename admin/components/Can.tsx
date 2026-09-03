'use client';

import type { ReactNode } from 'react';
import { Can as SharedCan, RequirePermission as SharedRequirePermission } from '@hms/client';
import { Forbidden } from './Forbidden';

/**
 * The permission guards, with this app's own 403 panel wired in (ADR-054).
 *
 * The logic is shared; the panel is not — each frontend sends a refused user
 * somewhere different. Neither guard is a security boundary: the backend re-checks
 * every action independently (invariant #2).
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
  return (
    <SharedCan perm={perm} fallback={fallback}>
      {children}
    </SharedCan>
  );
}

export function RequirePermission({ perm, children }: { perm: string; children: ReactNode }) {
  return (
    <SharedRequirePermission perm={perm} forbidden={<Forbidden />}>
      {children}
    </SharedRequirePermission>
  );
}
