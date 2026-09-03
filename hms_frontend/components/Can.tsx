'use client';

import type { ReactNode } from 'react';
import { Can as SharedCan, RequirePermission as SharedRequirePermission } from '@hms/client';
import { Forbidden } from './Forbidden';

/**
 * The permission guards, with the Portal's own 403 panel wired in (ADR-054).
 *
 * The logic is shared across frontends; the panel is not — each app sends a refused
 * user somewhere different. Neither guard is a security boundary: the backend
 * re-checks every action independently (invariant #2).
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
  // The key is handed to the panel so a refusal can name what is missing, say whether the
  // hospital even has the module, and list the roles that hold it (ADR-126).
  return (
    <SharedRequirePermission perm={perm} forbidden={<Forbidden perm={perm} />}>
      {children}
    </SharedRequirePermission>
  );
}
