'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, ExternalLink } from 'lucide-react';
import { Button, Card } from '@hms/ui';
import { useAuth } from '../lib/auth';
import { PORTAL_URL } from '../lib/portal';

/**
 * The standard 403 panel for the admin console.
 *
 * **It must always offer a way out.** This panel replaces the whole app shell when a
 * signed-in user is not a platform operator — so there is no navigation and no user
 * menu behind it. Without Sign out, the only action was "Back to the overview", which
 * lands on the same gate: a signed-in person could not leave the page or change
 * account without clearing cookies by hand.
 *
 * It also names the account. Reaching this screen almost always means signing in with
 * the wrong one — usually a hospital's org_admin, whose session is perfectly valid but
 * belongs on the Portal — and telling someone "you don't have access" without telling
 * them *who they are* leaves them guessing.
 */
export function Forbidden() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      // Whether or not the server call succeeded, the local session is gone — so send
      // them to sign-in either way. `replace`, matching AppShell: the forbidden page is
      // not somewhere Back should return to.
      router.replace('/login');
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <Card className="max-w-md text-center">
        <div className="flex flex-col items-center gap-3">
          <span className="hms-badge hms-badge--danger">403 · Forbidden</span>
          <h1 className="text-lg font-semibold text-fg">You don&apos;t have access to this</h1>
          <p className="text-sm text-fg-muted">
            This console is for Nirogix platform operators. Your role doesn&apos;t include the
            permission it requires. If you believe that is a mistake, contact the platform owner.
          </p>

          {user ? (
            <p className="text-sm text-fg-muted">
              Signed in as <span className="font-medium text-fg">{user.email}</span>
            </p>
          ) : null}

          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => void signOut()} loading={signingOut}>
              <LogOut size={16} strokeWidth={2} aria-hidden /> Sign out
            </Button>
            <a href={PORTAL_URL} rel="noreferrer">
              <Button variant="secondary">
                <ExternalLink size={16} strokeWidth={2} aria-hidden /> Go to the Nirogix Portal
              </Button>
            </a>
          </div>

          <p className="mt-1 text-xs text-fg-subtle">
            Hospital staff — including a hospital&apos;s own administrator — work in the Portal, not
            here.
          </p>
        </div>
      </Card>
    </div>
  );
}
