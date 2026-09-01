"use client";

import Link from "next/link";
import { PERMISSIONS } from "@hms/permissions";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";
import { PublicAccessPanel } from "../../../../components/settings/PublicAccessPanel";
import { useCheckinQr } from "../../../../components/print/useCheckinQr";

/**
 * Self check-in (ADR-118) — the third and, deliberately, last surface built on the ADR-056 pattern,
 * as a configuration of the shared `PublicAccessPanel`.
 *
 * The promise this page states, because it is the one people get wrong: scanning the code
 * **announces an arrival**, it does not check anybody in. The front desk confirms from the Arrivals
 * board, which is one click — and is also the identity check, because they can see the patient.
 */
export default function SelfCheckinSettingsPage() {
  return (
    <RequirePermission perm={PERMISSIONS.ORG_PROFILE_MANAGE}>
      <PublicAccessPanel
        title="Patient self check-in"
        linkLabel="Check-in link"
        explainer={
          <>
            Patients scan this code in the entrance to say they have arrived for today&rsquo;s
            appointment.{" "}
            <strong className="font-medium text-fg">Nobody is checked in automatically</strong>. Each
            arrival appears on your{" "}
            <Link href="/opd/arrivals" className="text-brand hover:underline">
              Arrivals board
            </Link>
            , where one click checks the patient in against the appointment you already booked — and
            confirming is also the identity check, because your desk can see who is standing there.
          </>
        }
        pendingHref="/opd/arrivals"
        qrAlt="QR code linking to this hospital's self check-in page"
        downloadName="nirogix-self-check-in-qr.png"
        printHref="/print/check-in-qr"
        confirmDisableTitle="Turn off patient self check-in?"
        disabledNoun="self check-in"
        load={api.getSelfCheckinSettings}
        setEnabled={api.setSelfCheckinEnabled}
        regenerate={api.regenerateSelfCheckinToken}
        useQr={useCheckinQr}
      />
    </RequirePermission>
  );
}
