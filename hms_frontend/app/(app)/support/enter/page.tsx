"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { Card, Spinner } from "@hms/ui";
import * as api from "../../../../lib/api";
import { ADMIN_ORIGIN } from "../../../../lib/origins";
import { useAuth } from "../../../../lib/auth";

/**
 * The landing tab for a support session (ADR-037).
 *
 * A support session deliberately has **no refresh cookie** — cookies are shared
 * across tabs, so one would hijack the operator's own platform session everywhere
 * else. The session is therefore an in-memory access token belonging to this tab
 * alone, handed over from the opener via `postMessage`.
 *
 * The token is never put in the URL: query strings land in browser history, server
 * logs and `Referer` headers, and this token grants access inside a hospital.
 */
export default function SupportEnterPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [state, setState] = useState<"waiting" | "entering" | "failed">("waiting");
  const claimed = useRef(false);

  useEffect(() => {
    if (!window.opener) {
      setState("failed");
      return;
    }

    async function onMessage(event: MessageEvent) {
      // Only the platform admin app may hand this tab a session (ADR-051). Before the
      // frontends split this was a same-origin check; the admin console now lives on
      // its own origin, so the allowed sender is named explicitly and read from
      // configuration. Anything else is ignored — a token from another site is exactly
      // the attack this check exists to refuse.
      if (event.origin !== ADMIN_ORIGIN) return;
      const data = event.data as { type?: string; accessToken?: string } | null;
      if (data?.type !== "hms:support-session" || !data.accessToken || claimed.current) return;

      claimed.current = true;
      setState("entering");
      api.setAccessToken(data.accessToken);
      // Load the impersonated user's identity and permissions before rendering the
      // shell, so the sidebar and the support banner appear together.
      await refresh();
      router.replace("/dashboard");
    }

    window.addEventListener("message", onMessage);
    // Tell the opener this tab is ready to receive the session.
    window.opener.postMessage({ type: "hms:support-ready" }, ADMIN_ORIGIN);

    const timeout = setTimeout(() => {
      if (!claimed.current) setState("failed");
    }, 8000);

    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timeout);
    };
  }, [refresh, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card>
        <div className="flex max-w-md flex-col items-center gap-3 p-2 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-subtle text-brand">
            <LifeBuoy size={22} strokeWidth={1.75} aria-hidden />
          </span>
          {state === "failed" ? (
            <>
              <p className="font-semibold text-fg">Support session not received</p>
              <p className="text-sm text-fg-muted">
                This tab was opened directly, or the handover timed out. Start the session again from the tenant page —
                a support session cannot be resumed from a bookmark, by design.
              </p>
            </>
          ) : (
            <>
              <p className="flex items-center gap-2 font-semibold text-fg">
                <Spinner /> Entering the tenant…
              </p>
              <p className="text-sm text-fg-muted">
                This session lives in this tab only. Closing the tab ends your access.
              </p>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
