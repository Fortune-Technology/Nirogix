"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Card, DateDisplay, Skeleton } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { AbdmConsentStatus } from "@hms/types";
import * as api from "../../lib/api";
import { useCan } from "../../lib/auth";

/**
 * Whether anything is outstanding on this patient's national health records (ADR-120).
 *
 * **This card shows a state, never a record.** It is built for the front desk, which needs to
 * answer "is anything waiting?" and to tell a patient standing at the counter what is happening —
 * and which has no business reading another hospital's clinical data to do it. So there is no
 * source hospital here (a name like "oncology centre" is a diagnosis by implication), no record
 * count (a proxy for how ill somebody has been), and no requesting clinician.
 *
 * It also states the one thing people get wrong about ABDM, in the place where the misunderstanding
 * would matter: **asking is a doctor's job**. The request carries a named clinician's registration
 * number to the patient, and it commits the hospital to destroying what comes back (ADR-092). The
 * desk can see that nothing has been asked; it cannot ask.
 *
 * Renders nothing at all for a user without `abdm.consent.status.view`, and nothing when the
 * hospital is not entitled to the external-history capability — in which case the API 403s and the
 * card stays silent rather than advertising a feature this hospital does not have.
 */
export function ConsentStatusCard({ patientId }: { patientId: string }) {
  const canSeeStatus = useCan(PERMISSIONS.ABDM_CONSENT_STATUS_VIEW);
  const canRequest = useCan(PERMISSIONS.ABDM_HISTORY_REQUEST);

  const [status, setStatus] = useState<AbdmConsentStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!canSeeStatus) return;
    let alive = true;
    api
      .getConsentStatus(patientId)
      .then((s) => alive && setStatus(s))
      // A 403 here means this hospital is not entitled to external history. Saying nothing is
      // right: an error toast about a capability nobody asked for is noise at a busy desk.
      .catch(() => alive && setUnavailable(true));
    return () => {
      alive = false;
    };
  }, [canSeeStatus, patientId]);

  if (!canSeeStatus || unavailable) return null;
  if (!status) return <Skeleton className="h-20 w-full" />;

  const nothingEverAsked =
    status.awaitingPatient === 0 &&
    status.active === 0 &&
    status.declined === 0 &&
    status.lapsed === 0 &&
    status.failed === 0;

  return (
    <Card header="Records at other hospitals">
      <div className="flex flex-col gap-2 text-sm">
        {!status.canRequest ? (
          <p className="text-fg-muted">
            This patient has no verified ABHA, so their records at other hospitals cannot be
            requested. Verifying an ABHA is done from the patient&rsquo;s record.
          </p>
        ) : nothingEverAsked ? (
          <p className="text-fg-muted">
            Nothing has been requested.{" "}
            {canRequest
              ? "You can ask this patient for access from their record."
              : "A doctor can ask this patient for access — the request carries their name and registration number."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {status.awaitingPatient > 0 && (
              <li className="flex items-center gap-2">
                <Badge tone="warning">Waiting for the patient</Badge>
                <span className="text-fg-muted">
                  {status.awaitingPatient} request{status.awaitingPatient === 1 ? "" : "s"} — they
                  approve in their own ABHA app.
                </span>
              </li>
            )}
            {status.active > 0 && (
              <li className="flex flex-wrap items-center gap-2">
                <Badge tone="success">Consent granted</Badge>
                {status.activeUntil && (
                  <span className="text-fg-muted">
                    until <DateDisplay value={status.activeUntil} />
                  </span>
                )}
              </li>
            )}
            {status.declined > 0 && (
              <li className="flex items-center gap-2">
                <Badge tone="danger">Patient declined</Badge>
                {/* A decision, not a fault. Said plainly so nobody treats it as a retry prompt. */}
                <span className="text-fg-muted">That is their decision to make.</span>
              </li>
            )}
            {status.lapsed > 0 && (
              <li className="flex items-center gap-2">
                <Badge tone="neutral">Consent has lapsed</Badge>
                <span className="text-fg-muted">
                  {canRequest ? "Ask again from the record if it is still needed." : "A doctor can ask again."}
                </span>
              </li>
            )}
            {status.failed > 0 && (
              <li className="flex items-center gap-2">
                <Badge tone="danger">Could not be sent</Badge>
                <span className="text-fg-muted">A technical problem, not a patient decision.</span>
              </li>
            )}
          </ul>
        )}

        {/* The card never shows the records themselves; whoever may read them does it here. */}
        <p className="text-xs text-fg-subtle">
          Consent status only — no records are shown here.{" "}
          <Link href={`/patients/${patientId}`} className="text-brand hover:underline">
            Open the record
          </Link>{" "}
          to see the full history.
        </p>
      </div>
    </Card>
  );
}
