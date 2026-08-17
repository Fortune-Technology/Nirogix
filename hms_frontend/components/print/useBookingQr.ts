"use client";

import type { DocumentBrand } from "@hms/ui";
import { PATIENT_ORIGIN } from "../../lib/origins";
import { usePublicQr } from "./usePublicQr";

/**
 * The hospital's appointment-booking QR (ADR-069): the shared public-QR drawing rules
 * (`usePublicQr`) applied to the patient app's `/book/{token}` URL. Same contract as
 * the registration QR — the token is opaque, the backend resolves the hospital from
 * it, and scanning produces a *request* the front desk converts, never an appointment.
 */
export function useBookingQr(token: string | null, brand: DocumentBrand): { url: string | null; qr: string | null } {
  return usePublicQr(token ? `${PATIENT_ORIGIN}/book/${token}` : null, brand);
}
