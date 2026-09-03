'use client';

import type { DocumentBrand } from '@hms/ui';
import { PATIENT_ORIGIN } from '../../lib/origins';
import { usePublicQr } from './usePublicQr';

/**
 * The hospital's registration QR (ADR-056): the shared public-QR drawing rules
 * (`usePublicQr`) applied to the patient app's `/register/{token}` URL. The token is
 * opaque — the backend resolves the hospital from it on every call, so a QR for
 * Hospital A can never register a patient at Hospital B.
 */
export function useRegistrationQr(
  token: string | null,
  brand: DocumentBrand,
): { url: string | null; qr: string | null } {
  return usePublicQr(token ? `${PATIENT_ORIGIN}/register/${token}` : null, brand);
}
