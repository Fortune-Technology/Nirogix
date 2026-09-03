'use client';

import { ArrowUpRight, LogOut, ShieldAlert } from 'lucide-react';
import { Button, Card } from '@hms/ui';
import { useAuth } from '../lib/auth';
import { MARKETING_URL, PORTAL_URL } from '../lib/links';

/**
 * Signed in, but not authorised for the AI Portal.
 *
 * This is a different page from "signed out", and it has to be: the person has a valid
 * Nirogix account and did nothing wrong. Telling them only "you don't have access"
 * leaves them stuck on an origin with no navigation — they arrived here from somewhere
 * and there is no menu to leave by.
 *
 * So it says who they are signed in as (so they can tell whether they used the wrong
 * account), why access is separate, who grants it, and gives them a way back to work.
 *
 * It is not a security boundary. The backend refuses the request regardless, and a
 * patient principal never reaches this screen at all — it is refused by type before any
 * permission is read (ADR-052).
 */
export function AccessRestricted({ onSignOut }: { onSignOut: () => void }) {
  const { user } = useAuth();

  return (
    <Card>
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-warning-subtle text-warning">
          <ShieldAlert size={22} strokeWidth={2} aria-hidden />
        </span>
        <h1 className="text-lg font-semibold text-fg">AI Portal access restricted</h1>
        <p className="text-sm text-fg-muted">
          Your account is not authorised to use Nirogix AI tools. Access to the AI Portal is granted
          to individual accounts rather than to a role, so having an administrator account does not
          include it.
        </p>
        {user?.email ? (
          <p className="text-sm text-fg-subtle">
            Signed in as <span className="font-medium text-fg">{user.email}</span>
          </p>
        ) : null}
        <p className="text-sm text-fg-muted">
          If you believe you should have access, ask your hospital administrator or the Nirogix
          platform administrator to grant it to this account.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <a
          href={`${PORTAL_URL}/dashboard`}
          className="hms-btn hms-btn--primary w-full justify-center"
        >
          Return to Nirogix Portal
          <ArrowUpRight size={16} strokeWidth={2} aria-hidden />
        </a>
        <Button variant="secondary" className="w-full" onClick={onSignOut}>
          <LogOut size={16} strokeWidth={2} aria-hidden /> Sign out
        </Button>
      </div>

      <p className="mt-5 border-t border-border pt-4 text-center text-xs text-fg-subtle">
        <a href={MARKETING_URL} className="underline hover:text-fg-muted">
          About Nirogix
        </a>
      </p>
    </Card>
  );
}
