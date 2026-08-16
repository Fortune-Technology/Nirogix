"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
import { Alert, Card, EmptyState, ErrorState, Skeleton } from "@hms/ui";
import type { PatientHospital } from "@hms/types";
import * as api from "../../lib/api";

/**
 * The hospital picker (ADR-052).
 *
 * A patient may be registered at several hospitals, and each one holds its own record.
 * Choosing here is what sets the tenant for every read that follows — and the server
 * re-checks that choice against an active link on every request, so this screen is a
 * convenience, never the boundary.
 */
export default function HospitalsPage() {
  const [hospitals, setHospitals] = useState<PatientHospital[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api
      .myHospitals()
      .then((h) => {
        setHospitals(h);
        setError(null);
      })
      .catch((e) => setError(e instanceof api.ApiRequestError ? e.message : "Could not load your hospitals."));
  };

  useEffect(load, []);

  if (error) return <ErrorState title="Could not load your hospitals" message={error} onRetry={load} />;
  if (!hospitals) return <Skeleton height="12rem" />;

  return (
    <>
      <div>
        <h1 className="text-lg font-semibold text-fg">Your hospitals</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          Choose a hospital to see the records it holds for you.
        </p>
      </div>

      {hospitals.length === 0 ? (
        <Card>
          <EmptyState
            title="No hospitals yet"
            description="You will see a hospital here once it gives you portal access. Ask the hospital to check the mobile number or email on your file."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {hospitals.map((h) => (
            <Link
              key={h.tenantId}
              href={`/h/${h.tenantId}`}
              className="group flex items-center gap-3 rounded-token border border-border bg-surface p-4 transition-colors hover:border-brand"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-token bg-brand-subtle text-brand">
                <Building2 size={18} strokeWidth={2} aria-hidden />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{h.name}</span>
              <ArrowRight
                size={16}
                strokeWidth={2}
                className="shrink-0 text-fg-subtle transition-colors group-hover:text-brand"
                aria-hidden
              />
            </Link>
          ))}
        </div>
      )}

      <Alert>
        Nothing is stored on this device. Sign out when you are finished, especially on a shared computer.
      </Alert>
    </>
  );
}
