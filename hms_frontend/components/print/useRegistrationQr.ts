"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ensureContrast } from "@hms/utils";
import type { DocumentBrand } from "@hms/ui";
import { PATIENT_ORIGIN } from "../../lib/origins";

/**
 * The hospital's registration QR, in the hospital's own colour (ADR-056).
 *
 * Two things are deliberate here.
 *
 * **The colour is the tenant's, not a hard-coded black** — but it is passed through
 * `ensureContrast` first. A QR is read by a camera, often off a photocopy, so a pale
 * accent that is perfectly legible as an interface colour would produce a code that
 * does not scan. Darkening preserves the hue, so it stays recognisably the hospital's
 * colour rather than silently becoming black.
 *
 * **The light modules stay pure white.** Tinting them would narrow the reflectance
 * difference the scanner depends on, for no gain a hospital would notice.
 *
 * Rendered at 1024px with `errorCorrectionLevel: "H"` (30% recovery), because this ends
 * up enlarged on a poster and photographed at an angle.
 */
export function useRegistrationQr(token: string | null, brand: DocumentBrand): { url: string | null; qr: string | null } {
  const url = token ? `${PATIENT_ORIGIN}/register/${token}` : null;
  const [qr, setQr] = useState<{ url: string; data: string } | null>(null);

  // A hospital that has configured no branding gets near-black, not the platform teal:
  // the poster is theirs, and printing a colour they never chose would be an invention.
  const ink = ensureContrast(brand.accent ?? "") ?? "#111111";

  useEffect(() => {
    if (!url) return;
    let alive = true;
    void QRCode.toDataURL(url, {
      width: 1024,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: ink, light: "#ffffff" },
    })
      .then((data) => {
        if (alive) setQr({ url, data });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [url, ink]);

  // Held with the URL it encodes, so a regenerated token can never show the retired
  // code beside the new link.
  return { url, qr: qr && qr.url === url ? qr.data : null };
}
