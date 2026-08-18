"use client";

import { useState } from "react";
import { Badge, Button, Dialog } from "@hms/ui";
import { FlaskConical } from "lucide-react";
import { DEV_USERS, isQuickLoginEnabled, type DevUser } from "../../lib/devUsers";

/**
 * Development/staging quick-login for the Platform Admin console. A compact "Test credentials"
 * button that opens a modal of the seeded Platform Super Admins as cards. Choosing one fills the
 * SAME login form via the SAME auth API (never a second auth path) and closes the modal, leaving
 * the user to sign in with the normal button.
 *
 * Returns `null` in production (gated by `isQuickLoginEnabled`, which keys off the build-time
 * `NEXT_PUBLIC_ENVIRONMENT` flag and defaults to disabled), so it can never appear there.
 */
export function QuickLogin({ onSelect, busy }: { onSelect: (user: DevUser) => void; busy?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!isQuickLoginEnabled()) return null;

  function choose(user: DevUser) {
    onSelect(user);
    setOpen(false);
  }

  return (
    <>
      <div className="mt-5 flex justify-center border-t border-border pt-4">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} disabled={busy}>
          <FlaskConical size={15} strokeWidth={2} aria-hidden />
          Test credentials
        </Button>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Test credentials"
        description="Choose a seeded platform admin to fill the sign-in form, then sign in with the usual button."
        size="lg"
      >
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge tone="warning">Development only</Badge>
          <span className="text-xs text-fg-subtle">Not available in production.</span>
        </div>

        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {DEV_USERS.map((user) => (
            <li key={`${user.orgCode}:${user.email}`}>
              <button
                type="button"
                onClick={() => choose(user)}
                className="flex h-full w-full flex-col gap-0.5 rounded-token border border-border p-3 text-left transition-colors hover:border-brand hover:bg-surface-2 focus-visible:border-brand focus-visible:outline-none"
              >
                <span className="text-sm font-semibold text-fg">{user.role}</span>
                <span className="break-all font-mono text-xs text-fg-muted">{user.email}</span>
                <span className="text-xs text-fg-subtle">
                  {user.orgName} <span className="font-mono text-fg-muted">· {user.orgCode}</span>
                </span>
                <span className="mt-1.5 text-xs font-medium text-brand">Use this account</span>
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
