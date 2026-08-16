"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PrintDocument, PrintNote, PrintSection, PrintToolbar, Spinner } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { RegistrationSettings } from "@hms/types";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";
import { useDocumentBrand } from "../../../../components/print/useDocumentBrand";
import { useRegistrationQr } from "../../../../components/print/useRegistrationQr";

/**
 * The patient-registration poster (ADR-047, ADR-056).
 *
 * A document, not a screenshot of a screen — which is why it is a route here rather
 * than the `window.print()` on a hand-built popup this replaced. It gets the hospital's
 * own logo, name, address and colour from the same `useDocumentBrand` every invoice and
 * lab report uses, so a poster on the wall and a bill at the counter look like they came
 * from the same hospital.
 *
 * The token is **not** in the URL: this page reads the hospital's registration settings
 * itself, under the same permission as the settings screen, so a printable route cannot
 * be handed a token belonging to anyone else.
 */
function RegistrationPoster() {
  const router = useRouter();
  const { brand, ready } = useDocumentBrand();
  const [settings, setSettings] = useState<RegistrationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getRegistrationSettings()
      .then(setSettings)
      .catch((e) =>
        setError(e instanceof api.ApiRequestError ? e.message : "Could not load your registration settings."),
      );
  }, []);

  const { url, qr } = useRegistrationQr(settings?.token ?? null, brand);

  if (error) return <p className="mx-auto max-w-2xl text-center text-sm text-danger">{error}</p>;

  if (settings && !settings.enabled) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-sm text-fg-muted">
          Patient self-registration is switched off, so there is no poster to print. Turn it on under Hospital
          configuration → Patient registration.
        </p>
      </div>
    );
  }

  if (!settings || !ready || !qr || !url) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-fg-muted">
        <Spinner /> Preparing the poster…
      </div>
    );
  }

  return (
    <>
      <PrintToolbar onBack={() => router.push("/settings/registration")} backLabel="Back to settings" />

      <PrintDocument
        brand={brand}
        title="Patient registration"
        computerGenerated={false}
        footerNote="Display at reception, the entrance or the waiting area."
      >
        <PrintSection>
          <div className="hms-qr-poster">
            <p className="hms-qr-poster__lead">Register with us before you reach the desk</p>
            <p className="hms-qr-poster__sub">
              Scan this code with your phone camera and send us your details. It takes about a minute.
            </p>

            {/* eslint-disable-next-line @next/next/no-img-element -- a generated data: URI,
                and the print dialog must not open before it has loaded */}
            <img src={qr} alt="" className="hms-qr-poster__code" />

            <p className="hms-qr-poster__url">{url}</p>
          </div>
        </PrintSection>

        <PrintNote title="What happens next">
          Our reception team checks your details and completes your registration when you arrive. Sending this form
          does not book an appointment, and it does not create an account.
        </PrintNote>
      </PrintDocument>
    </>
  );
}

export default function RegistrationQrPrintPage() {
  return (
    <RequirePermission perm={PERMISSIONS.ORG_PROFILE_MANAGE}>
      <RegistrationPoster />
    </RequirePermission>
  );
}
