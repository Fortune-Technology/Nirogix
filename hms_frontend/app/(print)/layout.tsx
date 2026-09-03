'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@hms/ui';
import { useAuth } from '../../lib/auth';

/**
 * The print context (ADR-047) — authenticated, but **without the application
 * shell**. No sidebar, no topbar, no bottom navigation, no back-to-top: a printable
 * document is a document, and the interface used to reach it has no business on the
 * paper.
 *
 * It is a route group rather than a `@media print` trick on the app pages, because
 * hiding the shell in CSS still leaves it in the DOM, still lets a stray screen
 * style leak onto the page, and gives no honest preview of what will come out of
 * the printer. Here, what you see is what prints.
 *
 * Authorization is unchanged: the same session gate as the app, the same
 * `RequirePermission` on each document, and the same RLS-scoped endpoints — a user
 * cannot print what they could not open.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-fg-muted">
        <Spinner /> <span className="ml-2">Loading…</span>
      </div>
    );
  }

  return <div className="hms-print-page">{children}</div>;
}
