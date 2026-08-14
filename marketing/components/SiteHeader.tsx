import { Button } from "@hms/ui";
import { PORTAL_LOGIN_URL } from "../lib/portal";

// Public site header. The primary action is "Sign in", which links to the Portal.
export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
        <a href="/" className="flex items-center gap-2">
          <span className="inline-block h-6 w-6 rounded-token bg-brand" aria-hidden />
          <span className="font-semibold text-fg">HMS</span>
        </a>
        <nav className="flex items-center gap-2">
          <a href={PORTAL_LOGIN_URL} className="text-sm font-medium text-fg-muted hover:text-fg">
            Sign in
          </a>
          <a href={PORTAL_LOGIN_URL}>
            <Button size="sm">Go to Portal</Button>
          </a>
        </nav>
      </div>
    </header>
  );
}
