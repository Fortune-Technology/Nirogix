"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Alert, Card, ErrorState, Skeleton } from "@hms/ui";
import * as api from "../../lib/api";
import type { AiPortalSession } from "../../lib/api";

/**
 * The AI Portal's landing screen (ADR-053).
 *
 * It says, in the product's own words, that there is no AI capability here yet. That is
 * the entire content, and it is deliberate: a portal that hinted at features it does not
 * have — a disabled "Ask" box, a greyed-out model picker, a "coming soon" carousel —
 * would be a promise, and this platform's binding rule is that we never present unbuilt
 * work as product.
 *
 * The screen renders whatever `capabilities` the server returns. Today that is an empty
 * list, so there is nothing to render, and the copy explains why rather than leaving a
 * blank page.
 */
export default function AiPortalHome() {
  const [session, setSession] = useState<AiPortalSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api
      .enterPortal()
      .then((s) => {
        setSession(s);
        setError(null);
      })
      .catch((e) => setError(e instanceof api.ApiRequestError ? e.message : "Could not open the AI Portal."));
  };

  useEffect(load, []);

  if (error) return <ErrorState title="Could not open the AI Portal" message={error} onRetry={load} />;
  if (!session) return <Skeleton height="12rem" />;

  return (
    <>
      <div>
        <h1 className="text-lg font-semibold text-fg">Nirogix AI</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          Your access has been recorded. Here is what this portal can do today.
        </p>
      </div>

      {session.capabilities.length === 0 ? (
        <Card header="No capability is enabled">
          <p className="text-sm text-fg-muted">{session.notice}</p>
          <p className="mt-3 text-sm text-fg-muted">
            When one is added it will appear here, behind the access control you have just passed through — which is
            why this portal exists before the capability does. Anything that touches diagnosis or treatment additionally
            needs a regulatory classification review before it is built at all.
          </p>
        </Card>
      ) : (
        <Card header="Available">
          <ul className="flex flex-col gap-2">
            {session.capabilities.map((c) => (
              <li key={c} className="text-sm text-fg">
                {c}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Alert>
        <span className="flex items-start gap-2">
          <ShieldCheck size={16} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Access to this portal is granted per person and is not part of any role. Every entry is recorded in the
            audit trail, and patients cannot sign in here at all.
          </span>
        </span>
      </Alert>
    </>
  );
}
