"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@hms/ui";
import { useAuth } from "../../lib/auth";
import { AppShell } from "../../components/AppShell";
import { BrandingLoader } from "../../components/BrandingLoader";

// Client-side gate for every authenticated route. Redirects to /login when there is
// no session. This is UX routing only — each API call is independently authorized
// by the backend, so an unauthenticated user reaching a page still gets no data.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
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

  return (
    <>
      <BrandingLoader />
      <AppShell>{children}</AppShell>
    </>
  );
}
