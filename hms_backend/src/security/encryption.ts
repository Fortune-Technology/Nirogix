import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { env, isProd } from '../config/env';
import { logger } from '../config/logger';

/**
 * Application-level encryption at rest for bearer credentials (ADR-084).
 *
 * Used for ABDM linking tokens today. Disk encryption protects a stolen volume; it does not
 * protect against SQL injection, an over-broad read-replica grant, or a support engineer with
 * `SELECT`. A token that authenticates against a person's national health identity has to be
 * unreadable in the row itself.
 *
 * **AES-256-GCM**, because these values are read back and used — authenticated encryption gives
 * both confidentiality and tamper detection, which a hash cannot. (A hash is the right answer
 * for passwords and OTPs, and those paths already use one.)
 *
 * Ciphertext format: `v1.<iv base64>.<authTag base64>.<ciphertext base64>`. The version prefix
 * is what makes key rotation possible later without guessing at legacy rows.
 */

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // GCM standard nonce length
const KEY_BYTES = 32;

let cachedKey: Buffer | null = null;

/**
 * Resolves the 32-byte key from `ENCRYPTION_KEY` (base64, or 64-character hex).
 *
 * Fails hard rather than falling back to a default: an encryption helper that silently uses a
 * predictable key is worse than one that refuses to start, because it looks like it worked.
 */
function key(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = env.ENCRYPTION_KEY;
  if (!raw) {
    // Generate one with:
    //   node -p "require('node:crypto').randomBytes(32).toString('base64')"
    throw new Error('ENCRYPTION_KEY is not set — see hms_backend/.env.example for how to generate one');
  }
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== KEY_BYTES) {
    throw new Error(`ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${buf.length}`);
  }
  cachedKey = buf;
  return buf;
}

/** Whether encryption is usable. Callers gate optional features on this instead of throwing. */
export function isEncryptionConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/** Encrypts a UTF-8 string for storage. Returns the versioned, self-describing envelope. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    VERSION,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ct.toString('base64'),
  ].join('.');
}

/**
 * Decrypts a value produced by `encryptSecret`. Throws on a tampered or truncated envelope —
 * a GCM authentication failure is a security event, never something to swallow into a null.
 */
export function decryptSecret(envelope: string): string {
  const parts = envelope.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Unrecognised ciphertext envelope');
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivB64!, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64!, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64!, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}

/** Decrypts, or returns null when the value is absent or undecryptable. For read paths that degrade. */
export function tryDecryptSecret(envelope: string | null | undefined): string | null {
  if (!envelope) return null;
  try {
    return decryptSecret(envelope);
  } catch {
    return null;
  }
}

/** Constant-time compare for secrets arriving from outside (callback signatures, shared keys). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Startup assertion. Production must not run with an unconfigured key while a feature that
 * needs one is enabled — the failure would otherwise surface as a 500 on a patient's first
 * ABHA verification, at the counter.
 */
export function assertEncryptionReady(featureName: string): void {
  if (!isEncryptionConfigured()) {
    const message = `${featureName} requires ENCRYPTION_KEY to be configured`;
    if (isProd) throw new Error(message);
    logger.warn({ feature: featureName }, `${message} — the feature will refuse requests until it is set.`);
  }
}
