"use client";

import Link from "next/link";
import { PERMISSIONS } from "@hms/permissions";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";
import { PublicAccessPanel } from "../../../../components/settings/PublicAccessPanel";
import { useBookingQr } from "../../../../components/print/useBookingQr";

/**
 * Online appointment booking (ADR-069) — the ADR-056 pattern applied to appointments,
 * as a configuration of the shared `PublicAccessPanel`. The one promise this page
 * states: a submission is a **request**, not an appointment; the front desk converts
 * it under the same roster and double-booking rules as booking by hand.
 */
export default function BookingSettingsPage() {
  return (
    <RequirePermission perm={PERMISSIONS.ORG_PROFILE_MANAGE}>
      <PublicAccessPanel
        title="Online appointment booking"
        linkLabel="Booking link"
        explainer={
          <>
            Patients scan your QR code and ask for an appointment before they call or visit.{" "}
            <strong className="font-medium text-fg">Nothing is booked automatically</strong>. Each submission arrives
            as a request your front desk reviews and converts into a real appointment, under the same roster and
            double-booking rules as booking by hand. Requests wait under{" "}
            <Link href="/appointments/requests" className="text-brand hover:underline">
              Booking requests
            </Link>
            .
          </>
        }
        pendingHref="/appointments/requests"
        qrAlt="QR code linking to this hospital's appointment request form"
        downloadName="nirogix-appointment-booking-qr.png"
        printHref="/print/booking-qr"
        confirmDisableTitle="Turn off online appointment booking?"
        disabledNoun="online booking"
        load={api.getBookingSettings}
        setEnabled={api.setOnlineBooking}
        regenerate={api.regenerateBookingToken}
        useQr={useBookingQr}
      />
    </RequirePermission>
  );
}
