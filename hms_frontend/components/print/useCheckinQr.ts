"use client";

import type { DocumentBrand } from "@hms/ui";
import { PATIENT_ORIGIN } from "../../lib/origins";
import { usePublicQr } from "./usePublicQr";

/**
 * The hospital's self check-in QR (ADR-118): the shared public-QR drawing rules applied to the
 * patient app's `/check-in/{token}` URL. Same contract as the other two — the token is opaque, the
 * backend resolves the hospital from it, and scanning produces an *announcement* the front desk
 * confirms, never a visit.
 */
export function useCheckinQr(token: string | null, brand: DocumentBrand): { url: string | null; qr: string | null } {
  return usePublicQr(token ? `${PATIENT_ORIGIN}/check-in/${token}` : null, brand);
}
