"use client";

import { PERMISSIONS } from "@hms/permissions";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";
import { PublicAccessPanel } from "../../../../components/settings/PublicAccessPanel";
import { useRegistrationQr } from "../../../../components/print/useRegistrationQr";

/**
 * Patient self-registration (ADR-056) — a configuration of the shared
 * `PublicAccessPanel`. The one promise this page states: a submission is a
 * **request**, not a patient; the front desk converts it.
 */
export default function RegistrationSettingsPage() {
  return (
    <RequirePermission perm={PERMISSIONS.ORG_PROFILE_MANAGE}>
      <PublicAccessPanel
        title="Patient self-registration"
        linkLabel="Registration link"
        explainer={
          <>
            Patients scan your QR code and send their details before they reach the desk.{" "}
            <strong className="font-medium text-fg">Nothing is added to your patient list automatically</strong> — each
            submission arrives as a request your front desk reviews, checks against existing records, and converts into
            a patient. You stay in control of who is in your records.
          </>
        }
        qrAlt="QR code linking to this hospital's patient registration form"
        downloadName="nirogix-patient-registration-qr.png"
        printHref="/print/registration-qr"
        confirmDisableTitle="Turn off patient self-registration?"
        disabledNoun="self-registration"
        load={api.getRegistrationSettings}
        setEnabled={api.setSelfRegistration}
        regenerate={api.regenerateRegistrationToken}
        useQr={useRegistrationQr}
      />
    </RequirePermission>
  );
}
