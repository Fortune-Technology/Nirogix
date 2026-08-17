"use client";

import { PERMISSIONS } from "@hms/permissions";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";
import { PublicQrPoster } from "../../../../components/print/PublicQrPoster";
import { useBookingQr } from "../../../../components/print/useBookingQr";

/** The appointment-booking poster (ADR-047, ADR-069) — a configuration of the shared poster document. */
export default function BookingQrPrintPage() {
  return (
    <RequirePermission perm={PERMISSIONS.ORG_PROFILE_MANAGE}>
      <PublicQrPoster
        title="Appointment booking"
        lead="Scan to request an appointment"
        sub="Scan this code with your phone camera and tell us when you would like to come in. It takes about a minute."
        whatNext="Our team confirms the doctor and the exact time with you — scanning this code sends a request, it does not book a slot by itself."
        disabledMessage="Online appointment booking is switched off, so there is no poster to print. Turn it on under Hospital configuration → Online booking."
        backHref="/settings/booking"
        load={api.getBookingSettings}
        useQr={useBookingQr}
      />
    </RequirePermission>
  );
}
