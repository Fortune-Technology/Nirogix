import Link from "next/link";
import { Button, Card } from "@hms/ui";

// The standard 403 panel for the admin console. The copy and the return link are
// this app's own; the guard logic is shared (@hms/client, ADR-054).
export function Forbidden() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <Card className="max-w-md text-center">
        <div className="flex flex-col items-center gap-3">
          <span className="hms-badge hms-badge--danger">403 · Forbidden</span>
          <h1 className="text-lg font-semibold text-fg">You don&apos;t have access to this</h1>
          <p className="text-sm text-fg-muted">
            Your role doesn&apos;t include the permission required for this page. If you believe this is a
            mistake, contact the platform owner.
          </p>
          <Link href="/">
            <Button variant="secondary">Back to the overview</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
