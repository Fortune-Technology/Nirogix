import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

const run = promisify(execFile);

/**
 * Encrypting health records for a Health Information User (ADR-091).
 *
 * ABDM uses ECDH over Curve25519: we generate a key pair, derive a shared secret from our private
 * key and the HIU's public key material, encrypt with it, and send our public key alongside so the
 * HIU can derive the same secret. **Fidelius**, NHA's own reference implementation, does the work —
 * on the owner's instruction and for a good reason: an assessor recognises it, and hand-rolling the
 * key-derivation details of somebody else's protocol is how interoperability failures are
 * discovered in production rather than in review.
 *
 * Fidelius is a Java CLI, so this shells out to it. Two consequences are load-bearing:
 *
 * 1. **A JRE is a deployment dependency.** Its absence is not a warning to log past — see below.
 * 2. **There is no plaintext fallback. Ever.** If encryption cannot be performed, the transfer
 *    fails and the gateway is told it failed. A "degraded mode" that pushed readable clinical
 *    records to a third party would be the single worst bug this system could have, so the code
 *    is written so that no path reaches the push without a ciphertext.
 */

export interface KeyMaterial {
  cryptoAlg: 'ECDH';
  curve: 'Curve25519';
  dhPublicKey: { expiry: string; parameters: string; keyValue: string };
  nonce: string;
}

export interface EncryptedPayload {
  /** Base64 ciphertext, ready for the `content` field of a data-push entry. */
  content: string;
  /** Base64 MD5 of the PRE-encrypted content, so the HIU can verify what it decrypted. */
  checksum: string;
  /** Our public key and nonce — what the HIU needs to derive the same shared secret. */
  keyMaterial: KeyMaterial;
}

export class EncryptionUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionUnavailableError';
  }
}

/**
 * The checksum ABDM asks for: base64 of the MD5 of the plaintext.
 *
 * MD5 is not a security choice here and is not ours to make — it is an integrity check the HIU
 * performs after decrypting, specified by NHA. Confidentiality comes from the ECDH layer above it.
 */
export function contentChecksum(plaintext: string): string {
  return createHash('md5').update(plaintext, 'utf8').digest('base64');
}

/**
 * Encrypts one document for one HIU.
 *
 * In mock mode this produces a **clearly-marked, non-secret envelope** so the pipeline — consent
 * checks, paging, push, notify — is testable without a JVM. It is deliberately not a real cipher
 * and is deliberately obvious about it: `ABDM_PROVIDER=mock` already refuses to run in production
 * (ADR-084), so there is no path on which this reaches a real HIU.
 */
export async function encryptForHiu(input: {
  plaintext: string;
  hiuPublicKey: string;
  hiuNonce: string;
}): Promise<EncryptedPayload> {
  const checksum = contentChecksum(input.plaintext);

  if (env.ABDM_PROVIDER !== 'gateway') {
    const nonce = randomBytes(32).toString('base64');
    return {
      content: Buffer.from(`MOCK-NOT-ENCRYPTED:${input.plaintext}`).toString('base64'),
      checksum,
      keyMaterial: {
        cryptoAlg: 'ECDH',
        curve: 'Curve25519',
        dhPublicKey: { expiry: expiryIso(), parameters: 'Curve25519/32byte random key', keyValue: 'MOCK-PUBLIC-KEY' },
        nonce,
      },
    };
  }

  if (!env.FIDELIUS_CLI_PATH) {
    // A configuration gap, surfaced as a refusal rather than a fallback.
    throw new EncryptionUnavailableError(
      'FIDELIUS_CLI_PATH is not configured — health records cannot be encrypted, so nothing will be sent',
    );
  }

  try {
    // Fidelius reads the sender key material, the receiver public key and the payload, and returns
    // the ciphertext with the public key the HIU must use.
    const { stdout } = await run(
      'java',
      ['-jar', env.FIDELIUS_CLI_PATH, 'e', input.hiuNonce, input.hiuPublicKey, input.plaintext],
      { maxBuffer: 64 * 1024 * 1024, timeout: 60_000 },
    );
    const parsed = JSON.parse(stdout) as {
      encryptedData?: string;
      keyToShare?: string;
      nonce?: string;
      error?: string;
    };
    if (!parsed.encryptedData || !parsed.keyToShare) {
      throw new EncryptionUnavailableError(parsed.error ?? 'Fidelius returned no ciphertext');
    }
    return {
      content: parsed.encryptedData,
      checksum,
      keyMaterial: {
        cryptoAlg: 'ECDH',
        curve: 'Curve25519',
        dhPublicKey: { expiry: expiryIso(), parameters: 'Curve25519/32byte random key', keyValue: parsed.keyToShare },
        nonce: parsed.nonce ?? randomBytes(32).toString('base64'),
      },
    };
  } catch (err) {
    // Including "java: not found". The JRE is a deployment dependency, and its absence must read
    // as a refusal to send, never as a reason to send something else.
    const message = err instanceof Error ? err.message : 'Fidelius failed';
    logger.error({ err }, 'ABDM encryption failed — no data will be transferred');
    throw new EncryptionUnavailableError(message);
  }
}

/** Key material is short-lived by design; the HIU has the data long before this matters. */
function expiryIso(): string {
  return new Date(Date.now() + 24 * 60 * 60_000).toISOString();
}
