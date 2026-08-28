"use client";

import { PERMISSIONS } from "@hms/permissions";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";
import { PublicQrPoster } from "../../../../components/print/PublicQrPoster";
import { useRegistrationQr } from "../../../../components/print/useRegistrationQr";

/** The patient-registration poster (ADR-047, ADR-056) — a configuration of the shared poster document. */
export default function RegistrationQrPrintPage() {
  return (
    <RequirePermission perm={PERMISSIONS.ORG_PROFILE_MANAGE}>
      <PublicQrPoster
        title="Patient registration"
        lead="Register with us before you reach the desk"
        sub="Scan this code with your phone camera and send us your details. It takes about a minute."
        whatNext="Our reception team checks your details and completes your registration when you arrive. Sending this form does not book an appointment, and it does not create an account."
        disabledMessage="Patient self-registration is switched off, so there is no poster to print. Turn it on under Hospital configuration → Patient registration."
        backHref="/hospital-setup/patient-registration"
        load={api.getRegistrationSettings}
        useQr={useRegistrationQr}
      />
    </RequirePermission>
  );
}
