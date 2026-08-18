"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import { useAuth } from "../../lib/auth";
import { AppShell } from "../../components/AppShell";
import { Forbidden } from "../../components/Forbidden";

/**
 * Gate for every authenticated route in the platform admin app (ADR-051).
 *
 * Two checks, not one. Being signed in is not enough here: this origin is for the
 * vendor's own operators, so a hospital's org_admin who reaches it — with a valid
 * session, because there is one backend — is shown the Forbidden panel rather than
 * an empty console. That is UX only; every endpoint this app calls is independently
 * gated by `platform.tenants.manage` and friends, so a hospital admin who types the
 * URL gets nothing from the API either.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status, can } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-fg-muted">
        <Spinner /> <span className="ml-2">Loading…</span>
      </div>
    );
  }

  // Platform operator = holds platform.tenants.manage, which only a super_admin in
  // the PLATFORM org resolves (ADR-020, ADR-022). Never a hospital's org_admin.
  if (!can(PERMISSIONS.TENANTS_MANAGE)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-6">
        <div className="w-full max-w-md">
          <Forbidden />
        </div>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
