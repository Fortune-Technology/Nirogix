"use client";

import { ensureContrast } from "@hms/utils";
import type { DocumentBrand } from "@hms/ui";
import { useQrDataUrl } from "../../lib/useQrDataUrl";

/**
 * A public-link QR in the hospital's own colour — the drawing rules ADR-056
 * established for the registration poster, shared by every public QR the Portal
 * issues (patient registration, appointment booking — ADR-069).
 *
 * **The colour is the tenant's, not a hard-coded black** — but it is passed through
 * `ensureContrast` first. A QR is read by a camera, often off a photocopy, so a pale
 * accent that is perfectly legible as an interface colour would produce a code that
 * does not scan. Darkening preserves the hue, so it stays recognisably the hospital's
 * colour rather than silently becoming black.
 *
 * Rendered at 1024px with `errorCorrectionLevel: "H"` (30% recovery), because this ends
 * up enlarged on a poster and photographed at an angle. The drawing itself lives in
 * `useQrDataUrl`, shared with the ABDM Scan-and-Share QR (ADR-029).
 */
export function usePublicQr(url: string | null, brand: DocumentBrand): { url: string | null; qr: string | null } {
  // A hospital that has configured no branding gets near-black, not the platform teal:
  // the poster is theirs, and printing a colour they never chose would be an invention.
  const ink = ensureContrast(brand.accent ?? "") ?? "#111111";
  const qr = useQrDataUrl(url, { ink, size: 1024, errorCorrectionLevel: "H" });
  return { url, qr };
}
