"use client";

import { Badge } from "@hms/ui";
import { DEV_USERS, isQuickLoginEnabled, type DevUser } from "../../lib/devUsers";

/**
 * Development/staging quick-login (issue #7). Renders a list of seeded test accounts that
 * pre-fill and submit the SAME login form via the SAME auth API — never a second auth path.
 *
 * Returns `null` in production (gated by `isQuickLoginEnabled`, which keys off the build-time
 * `NEXT_PUBLIC_ENVIRONMENT` flag and defaults to disabled), so it can never appear there.
 */
export function QuickLogin({ onSelect, busy }: { onSelect: (user: DevUser) => void; busy?: boolean }) {
  if (!isQuickLoginEnabled()) return null;

  return (
    <div className="mt-6 border-t border-border pt-5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-fg">Quick login</span>
        <Badge tone="warning">Dev only · not in production</Badge>
      </div>
      <p className="mb-3 text-xs text-fg-subtle">
        Non-production shortcut. Pick a seeded account to sign in as — it fills this form and uses
        the normal login. Run <code className="font-mono">npm run db:seed</code> if an account is missing.
      </p>

      <ul className="flex flex-col gap-1.5">
        {DEV_USERS.map((user) => (
          <li key={`${user.orgCode}:${user.email}`}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onSelect(user)}
              className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-token border border-border px-3 py-2 text-left text-sm transition-colors hover:border-brand hover:bg-surface-2 disabled:opacity-60"
            >
              <span className="font-medium text-fg">{user.role}</span>
              <span className="font-mono text-xs text-fg-muted">{user.email}</span>
              <span className="ml-auto text-xs text-fg-subtle">{user.orgName}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
