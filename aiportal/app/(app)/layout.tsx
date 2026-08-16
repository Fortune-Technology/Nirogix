"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Moon, Sun } from "lucide-react";
import { BrandMark, Button, Spinner } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/theme";
import { Forbidden } from "../../components/Forbidden";

/**
 * The AI Portal's gate (ADR-053).
 *
 * Two checks, and the second is the point: being signed in is not access. There is one
 * backend, so any staff account can authenticate here — `ai.portal.access` is what
 * decides, and **no role holds it by default**. A patient never reaches even the first
 * check: the backend refuses a patient principal by type (ADR-052).
 *
 * This guard is UX. The single endpoint this app calls re-checks the permission
 * server-side and audits the entry, so a user who somehow rendered this shell would
 * still get nothing.
 */
export default function AiAppLayout({ children }: { children: React.ReactNode }) {
  const { status, user, can, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const router = useRouter();

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg text-fg-muted">
        <Spinner /> <span className="ml-2">Loading…</span>
      </div>
    );
  }

  if (!can(PERMISSIONS.AI_PORTAL_ACCESS)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg p-6">
        <div className="w-full max-w-md">
          <Forbidden />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <BrandMark size={26} />
        <span className="font-semibold text-fg">Nirogix AI</span>
        <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">{user?.fullName}</span>
        <Button variant="secondary" size="sm" onClick={toggle} aria-label="Switch theme">
          {theme === "dark" ? <Sun size={16} strokeWidth={2} /> : <Moon size={16} strokeWidth={2} />}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
        >
          <LogOut size={16} strokeWidth={2} /> Sign out
        </Button>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 p-4 md:p-6">{children}</main>
    </div>
  );
}
