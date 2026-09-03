import Link from 'next/link';
import { Button, Card } from '@hms/ui';

// The standard 403 panel for the admin console. The copy and the return link are
// this app's own; the guard logic is shared (@hms/client, ADR-054).
export function Forbidden() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <Card className="max-w-md text-center">
        <div className="flex flex-col items-center gap-3">
          <span className="hms-badge hms-badge--danger">403 · Forbidden</span>
          <h1 className="text-lg font-semibold text-fg">You don&apos;t have AI Portal access</h1>
          <p className="text-sm text-fg-muted">
            Access to the AI Portal is granted per person and is not part of any role. If you need
            it, ask the platform owner to grant it to your account.
          </p>
          <Link href="/login">
            <Button variant="secondary">Back to sign in</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
