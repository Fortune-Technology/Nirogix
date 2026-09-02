"use client";

import { PERMISSIONS } from "@hms/permissions";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";
import { PublicQrPoster } from "../../../../components/print/PublicQrPoster";
import { useCheckinQr } from "../../../../components/print/useCheckinQr";

/**
 * The self check-in poster (ADR-047, ADR-118) — a configuration of the shared poster document.
 *
 * The copy carries the whole promise, because this poster goes in an entrance where nobody will
 * read anything longer: scanning tells the desk you are here. It does not check you in, and it is
 * not a substitute for the desk.
 */
export default function CheckinQrPrintPage() {
  return (
    <RequirePermission perm={PERMISSIONS.ORG_PROFILE_MANAGE}>
      <PublicQrPoster
        title="Already have an appointment today?"
        lead="Scan to tell us you have arrived"
        sub="Scan this code with your phone camera and enter the mobile number we have on your record. It takes a few seconds."
        whatNext="Our front desk is told you are here and will call you through. If you are not sure your appointment is today, or nobody calls you shortly, please come to the desk."
        disabledMessage="Self check-in is switched off, so there is no poster to print. Turn it on under Hospital configuration → Self check-in."
        backHref="/hospital-setup/public-access"
        load={api.getSelfCheckinSettings}
        useQr={useCheckinQr}
      />
    </RequirePermission>
  );
}
