"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Renders any payload to a QR data URL (ADR-029 — the drawing happens once, in one place).
 *
 * Extracted when the ABDM Scan-and-Share QR became the second QR in the Portal. The two have
 * different callers and different reasons to exist — one is a public link we issue on a printed
 * poster, the other an NHA-issued facility payload shown on a monitor — but the drawing is
 * identical, and two copies of it would drift on the details that decide whether a camera can
 * actually read the code.
 *
 * The light modules are always pure white: tinting them narrows the reflectance difference a
 * scanner depends on, for no gain anyone would notice.
 *
 * The result is held together with the value it encodes, so a payload that changes can never be
 * shown as the old code beside the new one.
 */
export function useQrDataUrl(
  value: string | null,
  options: { ink?: string; size?: number; errorCorrectionLevel?: "L" | "M" | "Q" | "H" } = {},
): string | null {
  const { ink = "#111111", size = 512, errorCorrectionLevel = "H" } = options;
  const [qr, setQr] = useState<{ value: string; data: string } | null>(null);

  useEffect(() => {
    if (!value) return;
    let alive = true;
    void QRCode.toDataURL(value, {
      width: size,
      margin: 2,
      errorCorrectionLevel,
      color: { dark: ink, light: "#ffffff" },
    })
      .then((data) => {
        if (alive) setQr({ value, data });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [value, ink, size, errorCorrectionLevel]);

  return qr && qr.value === value ? qr.data : null;
}
