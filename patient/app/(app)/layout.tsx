"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Moon, Sun } from "lucide-react";
import { BrandMark, Button, Spinner } from "@hms/ui";
import { useSession } from "../../lib/session";
import { useTheme } from "../../lib/theme";

/**
 * The signed-in shell for the patient portal (ADR-052, F-8).
 *
 * A reload now keeps the session: the provider exchanges an httpOnly refresh cookie for
 * a new access token on mount. This layout therefore waits for that attempt to finish
 * before deciding — redirecting on the first render would bounce every reload to
 * sign-in and undo the whole point.
 */
export default function PatientAppLayout({ children }: { children: React.ReactNode }) {
  const { status, signedIn, identity, signOut } = useSession();
  const { theme, toggle } = useTheme();
  const router = useRouter();

  useEffect(() => {
    // Only once the restore attempt has resolved — never while it is still in flight.
    if (status === "signed-out") router.replace("/login");
  }, [status, router]);

  if (!signedIn) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg text-fg-muted">
        <Spinner />
        <span className="ml-2">{status === "loading" ? "Restoring your session…" : "Taking you to sign in…"}</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <BrandMark size={26} />
          <span className="font-semibold text-fg">Nirogix</span>
        </Link>
        <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">{identity?.fullName ?? "Your records"}</span>
        <Button variant="secondary" size="sm" onClick={toggle} aria-label="Switch theme">
          {theme === "dark" ? <Sun size={16} strokeWidth={2} /> : <Moon size={16} strokeWidth={2} />}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await signOut();
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
