import { constants, publicEncrypt } from 'node:crypto';
import { logger } from '../../config/logger';
import type { AbdmProvider } from './providers/types';

/**
 * RSA encryption of everything ABDM refuses in plaintext (ADR-084).
 *
 * V3 requires the Aadhaar number, the mobile number and **the OTP itself** to be RSA-encrypted
 * with NHA's public certificate before transmission. (V1/V2 accepted plaintext OTPs; that is one
 * of the reasons V1/V2 implementations are rejected at sandbox exit.)
 *
 * **`RSA/ECB/OAEPWithSHA-1AndMGF1Padding`**, base64-encoded. This is not our choice to make — the
 * receiving end decides — and getting it wrong does NOT produce a decryption error. It produces
 * `400 {"loginId":"Invalid LoginId"}`, which reads exactly like a bad Aadhaar and sent us looking
 * at the wrong thing for an afternoon.
 *
 * Established empirically against the sandbox on 25/08/2026 by sending the same checksum-valid,
 * unassigned Aadhaar under three paddings (`npm run abdm:check -- --probe`, which still does this):
 *
 * - PKCS#1 v1.5    → `400 Invalid LoginId`  (not decrypted)
 * - **OAEP-SHA1**  → `422 ABDM-1204 "UIDAI Error code : 998 : Aadhaar number is incorrect"`
 * - OAEP-SHA256    → `400 Invalid LoginId`  (not decrypted)
 *
 * Only OAEP-SHA1 reached UIDAI at all. Note SHA-1 is specified for the **MGF1 mask**, not as a
 * signature or integrity primitive, so its collision weakness is not in play here; and it is what
 * the counterparty accepts, which settles it either way.
 *
 * The certificate is cached because it changes rarely and fetching it per call would add a
 * round trip to every OTP. The cache is time-boxed rather than permanent, so a rotation on
 * NHA's side heals without a deploy.
 */

const CERT_TTL_MS = 60 * 60_000; // one hour

let cache: { pem: string; fetchedAt: number } | null = null;
let inFlight: Promise<string> | null = null;

/**
 * NHA returns the certificate sometimes bare, sometimes already PEM-wrapped. Normalising here
 * means a change in their response formatting is a non-event rather than a decrypt failure.
 */
function toPem(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes('BEGIN PUBLIC KEY') || trimmed.includes('BEGIN CERTIFICATE')) return trimmed;
  const body = trimmed.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') ?? trimmed;
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}

/** The cached NHA public certificate, fetched through the active provider. */
export async function getPublicKey(provider: AbdmProvider): Promise<string> {
  if (cache && Date.now() - cache.fetchedAt < CERT_TTL_MS) return cache.pem;
  if (inFlight) return inFlight;

  inFlight = provider
    .getPublicCertificate()
    .then((raw) => {
      const pem = toPem(raw);
      cache = { pem, fetchedAt: Date.now() };
      logger.info({ provider: provider.name }, 'ABDM public certificate cached');
      return pem;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * Encrypts one value for ABDM.
 *
 * The plaintext argument is the only place an Aadhaar number exists in this process, and it is
 * never logged, never returned and never stored — callers pass it straight from the request body
 * into here and then let it go out of scope (see `abdm.service.ts`).
 */
export async function encryptForAbdm(provider: AbdmProvider, value: string): Promise<string> {
  const pem = await getPublicKey(provider);
  return publicEncrypt(
    { key: pem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' },
    Buffer.from(value, 'utf8'),
  ).toString('base64');
}

/** Test seam — clears the certificate cache between cases. */
export function __resetCertCacheForTests(): void {
  cache = null;
}
