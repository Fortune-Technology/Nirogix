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

/** The marker that makes a mock envelope impossible to mistake for real ciphertext. */
const MOCK_PREFIX = 'MOCK-NOT-ENCRYPTED:';

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

export interface KeyPair {
  /** Ours, and it never leaves this process unencrypted. Stored via `encryptSecret` when persisted. */
  privateKey: string;
  /** Base64 uncompressed — ABDM's recommended form, and what goes in `keyMaterial`. */
  publicKey: string;
  /** x509 form, kept because some participants send it and it costs nothing to carry. */
  x509PublicKey?: string;
  nonce: string;
}

/**
 * One invocation of the Fidelius CLI.
 *
 * Every call goes through here so the argument order — the part most likely to be wrong until the
 * jar has actually run — exists in exactly one place, and so "java is missing" produces the same
 * refusal as "Fidelius rejected the input" rather than an unhandled spawn error.
 */
async function fidelius(args: string[], what: string): Promise<Record<string, string>> {
  if (!env.FIDELIUS_CLI_PATH) {
    throw new EncryptionUnavailableError(
      `FIDELIUS_CLI_PATH is not configured — ${what} is impossible, so nothing will be sent or read`,
    );
  }
  try {
    const { stdout } = await run('java', ['-jar', env.FIDELIUS_CLI_PATH, ...args], {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 60_000,
    });
    const parsed = JSON.parse(stdout) as Record<string, string>;
    if (parsed.error) throw new EncryptionUnavailableError(parsed.error);
    return parsed;
  } catch (err) {
    if (err instanceof EncryptionUnavailableError) throw err;
    // Including "java: not found". The JRE is a deployment dependency, and its absence must read as
    // a refusal, never as a reason to fall back to something weaker.
    const message = err instanceof Error ? err.message : 'Fidelius failed';
    logger.error({ err, what }, 'Fidelius failed — no health data will be sent or read');
    throw new EncryptionUnavailableError(message);
  }
}

/**
 * A fresh ECDH key pair for one exchange (ADR-093).
 *
 * **Per request, never reused.** ABDM's own guidance, and the reason is compounding: one long-lived
 * key means one compromise retrospectively exposes every transfer ever made under it, while a
 * per-request key limits the blast radius to a single document set. The cost is one subprocess.
 */
export async function generateKeyPair(): Promise<KeyPair> {
  if (env.ABDM_PROVIDER !== 'gateway') {
    const nonce = randomBytes(32).toString('base64');
    return { privateKey: `MOCK-PRIVATE-${nonce.slice(0, 12)}`, publicKey: 'MOCK-PUBLIC-KEY', nonce };
  }
  const parsed = await fidelius(['g'], 'key generation');
  if (!parsed.privateKey || !parsed.publicKey) {
    throw new EncryptionUnavailableError('Fidelius returned no key pair');
  }
  return {
    privateKey: parsed.privateKey,
    publicKey: parsed.publicKey,
    x509PublicKey: parsed.x509PublicKey,
    nonce: parsed.nonce ?? randomBytes(32).toString('base64'),
  };
}

/**
 * Decrypts one entry a HIP pushed to us (ADR-093).
 *
 * The mirror of `encryptForHiu`: their public key and nonce plus our private key and nonce derive
 * the same shared secret they used. **Failure is never silent and never partial** — an entry we
 * cannot decrypt is reported to ABDM as errored rather than stored half-read or skipped quietly,
 * because a doctor shown an incomplete history has no way to know it is incomplete.
 */
export async function decryptFromHip(input: {
  ciphertext: string;
  ourPrivateKey: string;
  ourNonce: string;
  hipPublicKey: string;
  hipNonce: string;
}): Promise<string> {
  if (env.ABDM_PROVIDER !== 'gateway') {
    // The exact inverse of the mock envelope, so the whole pipeline is exercisable without a JVM.
    const decoded = Buffer.from(input.ciphertext, 'base64').toString('utf8');
    if (!decoded.startsWith(MOCK_PREFIX)) {
      throw new EncryptionUnavailableError('Mock decryption received something that was not a mock envelope');
    }
    return decoded.slice(MOCK_PREFIX.length);
  }
  const parsed = await fidelius(
    ['d', input.ourNonce, input.hipNonce, input.ourPrivateKey, input.hipPublicKey, input.ciphertext],
    'decryption',
  );
  if (!parsed.decryptedData) throw new EncryptionUnavailableError('Fidelius returned no plaintext');
  return parsed.decryptedData;
}

/**
 * Verifies a pushed entry is what the HIP hashed before encrypting it.
 *
 * ABDM specifies base64 MD5 of the **plaintext**, so this runs after decryption. It is an integrity
 * check, not a security control — confidentiality comes from the ECDH layer — but a mismatch means
 * we are holding something other than what was sent, and rendering that to a clinician would be
 * worse than showing nothing.
 */
export function checksumMatches(plaintext: string, expected?: string | null): boolean {
  if (!expected) return true; // Not every HIP sends one; absence is not a mismatch.
  return contentChecksum(plaintext) === expected;
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
      content: Buffer.from(`${MOCK_PREFIX}${input.plaintext}`).toString('base64'),
      checksum,
      keyMaterial: {
        cryptoAlg: 'ECDH',
        curve: 'Curve25519',
        dhPublicKey: { expiry: expiryIso(), parameters: 'Curve25519/32byte random key', keyValue: 'MOCK-PUBLIC-KEY' },
        nonce,
      },
    };
  }

  // Our own half of the exchange, fresh for this document set. Fidelius encrypts with BOTH sides'
  // material — this was previously omitted, which would have produced ciphertext no HIU could read.
  const ours = await generateKeyPair();
  const parsed = await fidelius(
    ['e', ours.nonce, input.hiuNonce, ours.privateKey, input.hiuPublicKey, input.plaintext],
    'encryption',
  );
  if (!parsed.encryptedData) throw new EncryptionUnavailableError('Fidelius returned no ciphertext');

  return {
    content: parsed.encryptedData,
    checksum,
    keyMaterial: {
      cryptoAlg: 'ECDH',
      curve: 'Curve25519',
      dhPublicKey: {
        expiry: expiryIso(),
        parameters: 'Curve25519/32byte random key',
        // What the HIU needs to derive the same secret: our PUBLIC key, never the private one.
        keyValue: parsed.keyToShare ?? ours.publicKey,
      },
      nonce: ours.nonce,
    },
  };
}

/** Key material is short-lived by design; the HIU has the data long before this matters. */
function expiryIso(): string {
  return new Date(Date.now() + 24 * 60 * 60_000).toISOString();
}
