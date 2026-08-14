import { PORTAL_LOGIN_URL } from "../lib/portal";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-5 py-6 text-sm text-fg-muted sm:flex-row">
        <span>© Takoriya Technology LLP · Hospital Management System</span>
        <a href={PORTAL_LOGIN_URL} className="font-medium text-brand hover:underline">
          Staff sign in →
        </a>
      </div>
    </footer>
  );
}
