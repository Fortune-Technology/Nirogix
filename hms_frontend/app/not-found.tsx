import Link from "next/link";
import { FileQuestion, LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

/**
 * The Portal's 404. Uses the design system's tokens and Lucide iconography so a
 * mistyped URL still looks like the product, never a browser error page. Kept
 * outside the authenticated shell: an unknown route may be hit while signed out.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-bg px-6 py-16 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-surface-2 text-fg-subtle">
        <FileQuestion size={28} strokeWidth={1.75} aria-hidden />
      </span>

      <div className="max-w-md">
        <p className="font-mono text-sm text-brand">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg">Page not found</h1>
        <p className="mt-3 text-[0.975rem] leading-relaxed text-fg-muted">
          This page does not exist, or it moved. If you followed a link from inside the Portal, the record may have
          been removed or you may not have access to it.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/dashboard" className="hms-btn hms-btn--primary">
          <LayoutDashboard size={16} strokeWidth={2} aria-hidden /> Go to dashboard
        </Link>
        <Link href="/login" className="hms-btn hms-btn--secondary">
          Sign in
        </Link>
      </div>
    </main>
  );
}
