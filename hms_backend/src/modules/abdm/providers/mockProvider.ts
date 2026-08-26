import { constants, createHash, generateKeyPairSync, privateDecrypt, type KeyObject } from 'node:crypto';
import { logger } from '../../../config/logger';
import { isProd } from '../../../config/env';
import {
  AbdmGatewayError,
  type AbdmCard,
  type AbdmEnrolResult,
  type AbdmLoginVerifyResult,
  type AbdmOtpResult,
  type AbdmProfile,
  type AbdmProvider,
} from './types';

/**
 * Offline ABDM stand-in (ADR-084).
 *
 * **Not a placeholder — a required piece of the design.** The ABDM sandbox rate-limits OTPs to a
 * few per mobile number per day, so a build that can only run against the real gateway cannot be
 * developed against, cannot run CI, and cannot be demonstrated. This provider makes the whole M1
 * surface exercisable with no network and no credentials, which is also how the automated tests
 * cover the flows.
 *
 * It implements the *contract*, not a shortcut: it holds a real RSA keypair, so the encryption
 * path in `abdm.crypto.ts` is genuinely exercised rather than bypassed, and the service cannot
 * accidentally come to depend on plaintext.
 *
 * Behaviour is deterministic and driven by the Aadhaar number's last digit, so a tester can
 * reproduce a scenario on demand:
 *
 * | last digit | scenario                                              |
 * |------------|-------------------------------------------------------|
 * | 0          | Aadhaar already has an ABHA — the returning-patient path |
 * | 1          | no mobile linked to the Aadhaar — forces the secondary mobile flow |
 * | 9          | ABDM rejects the OTP — the failure/fallback path       |
 * | any other  | a clean new ABHA creation                             |
 *
 * The fixed OTP is `123456`, mirroring how sandbox behaves (the OTP comes back in-band because
 * no SMS is sent). It is returned as `devOtp` **only** outside production, and this provider
 * refuses to run in production at all — a mocked national health identity in a live hospital is
 * not a degraded mode, it is a fabricated medical record.
 */

const FIXED_OTP = '123456';

let keys: { publicKey: KeyObject; privateKey: KeyObject; pem: string } | null = null;

function keypair() {
  if (keys) return keys;
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  keys = { publicKey, privateKey, pem: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
  return keys;
}

/**
 * Reverses `encryptForAbdm`, so the mock reads exactly what the real gateway would receive.
 *
 * OAEP-SHA1, matching what the sandbox proved it can actually decrypt (see `abdm.crypto.ts`). An
 * earlier version used PKCS#1 v1.5 and had to unwrap the padding block by hand, because Node
 * refuses `RSA_PKCS1_PADDING` for private decryption since the Marvin-attack fix
 * (CVE-2023-46809). Moving to the padding NHA actually wants removed that workaround entirely —
 * the correct answer and the simpler one turned out to be the same.
 */
function decrypt(value: string): string {
  try {
    return privateDecrypt(
      { key: keypair().privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' },
      Buffer.from(value, 'base64'),
    ).toString('utf8');
  } catch {
    throw new AbdmGatewayError(400, 'ABDM_DECRYPT_FAILED', 'Encrypted value could not be read');
  }
}

/** Deterministic 14-digit ABHA number, formatted the way NHA presents it. */
function abhaNumberFor(seed: string): string {
  const digits = createHash('sha256').update(seed).digest('hex').replace(/\D/g, '').padEnd(14, '7').slice(0, 14);
  return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}-${digits.slice(10, 14)}`;
}

function profileFor(aadhaar: string, mobile?: string): AbdmProfile {
  const n = Number(aadhaar.slice(-2)) || 42;
  const names = ['Aarav', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Ananya', 'Vikram', 'Ishita'];
  const surnames = ['Sharma', 'Patel', 'Iyer', 'Reddy', 'Nair', 'Gupta'];
  return {
    abhaNumber: abhaNumberFor(aadhaar),
    firstName: names[n % names.length],
    lastName: surnames[n % surnames.length],
    gender: n % 2 === 0 ? 'M' : 'F',
    dateOfBirth: `19${70 + (n % 30)}-0${(n % 9) + 1}-1${n % 9}`,
    mobile: mobile ?? `98${String(aadhaar).slice(-8)}`,
    address: `${(n % 90) + 1}, MG Road`,
    districtName: 'Pune',
    stateName: 'Maharashtra',
    pincode: `4110${n % 10}${(n + 3) % 10}`,
  };
}

/** In-memory transaction state. Process-local by design — this provider is never clustered. */
type MockTxn = { aadhaar: string; mobile?: string; abhaAddress?: string; scenario: string };
const txns = new Map<string, MockTxn>();

function scenarioOf(aadhaar: string): string {
  const last = aadhaar.slice(-1);
  if (last === '0') return 'existing';
  if (last === '1') return 'no-mobile';
  if (last === '9') return 'otp-fails';
  return 'new';
}

function newTxnId(seed: string): string {
  return `mock-${createHash('sha1').update(`${seed}:${txns.size}`).digest('hex').slice(0, 20)}`;
}

export class AbdmMockProvider implements AbdmProvider {
  readonly name = 'mock' as const;

  constructor() {
    if (isProd) {
      throw new Error('ABDM_PROVIDER=mock is refused in production — a simulated ABHA is a fabricated identity');
    }
    logger.warn('ABDM mock provider active — no ABDM calls will be made. Fixed OTP: 123456');
  }

  async getPublicCertificate(): Promise<string> {
    return keypair().pem;
  }

  async enrolRequestOtp(input: { encryptedAadhaar: string }): Promise<AbdmOtpResult> {
    const aadhaar = decrypt(input.encryptedAadhaar);
    if (!/^\d{12}$/.test(aadhaar)) {
      throw new AbdmGatewayError(400, 'ABDM_INVALID_AADHAAR', 'Aadhaar number must be 12 digits');
    }
    const scenario = scenarioOf(aadhaar);
    if (scenario === 'no-mobile') {
      throw new AbdmGatewayError(400, 'ABDM_NO_MOBILE_LINKED', 'No mobile number is linked to this Aadhaar');
    }
    const txnId = newTxnId(aadhaar);
    txns.set(txnId, { aadhaar, scenario });
    return { txnId, mobileHint: `XXXXXX${aadhaar.slice(-4)}`, devOtp: FIXED_OTP };
  }

  private require(txnId: string): MockTxn {
    const txn = txns.get(txnId);
    if (!txn) throw new AbdmGatewayError(404, 'ABDM_TXN_NOT_FOUND', 'This verification has expired. Start again.');
    return txn;
  }

  private checkOtp(txn: MockTxn, encryptedOtp: string): void {
    const otp = decrypt(encryptedOtp);
    if (txn.scenario === 'otp-fails' || otp !== FIXED_OTP) {
      throw new AbdmGatewayError(401, 'ABDM_INVALID_OTP', 'The OTP is incorrect or has expired');
    }
  }

  async enrolByAadhaar(input: { txnId: string; encryptedOtp: string; mobile?: string }): Promise<AbdmEnrolResult> {
    const txn = this.require(input.txnId);
    this.checkOtp(txn, input.encryptedOtp);
    txn.mobile = input.mobile;
    const profile = profileFor(txn.aadhaar, input.mobile);
    const existing = txn.scenario === 'existing';
    if (existing) profile.abhaAddress = `${profile.firstName?.toLowerCase()}${txn.aadhaar.slice(-4)}@sbx`;
    return {
      txnId: input.txnId,
      profile,
      tokens: { xToken: `mock-x-${input.txnId}`, refreshToken: `mock-r-${input.txnId}`, linkingToken: `mock-link-${input.txnId}` },
      isNewAbha: !existing,
      // Only the digits ABDM holds count as a match; a different number forces the second OTP.
      mobileMatchesAadhaar: !input.mobile || input.mobile.endsWith(txn.aadhaar.slice(-4)),
    };
  }

  async enrolMobileRequestOtp(input: { txnId: string; encryptedMobile: string }): Promise<AbdmOtpResult> {
    const txn = this.require(input.txnId);
    txn.mobile = decrypt(input.encryptedMobile);
    return { txnId: input.txnId, mobileHint: `XXXXXX${txn.mobile.slice(-4)}`, devOtp: FIXED_OTP };
  }

  async enrolMobileVerifyOtp(input: { txnId: string; encryptedOtp: string }): Promise<AbdmEnrolResult> {
    const txn = this.require(input.txnId);
    this.checkOtp(txn, input.encryptedOtp);
    return {
      txnId: input.txnId,
      profile: profileFor(txn.aadhaar, txn.mobile),
      tokens: { xToken: `mock-x-${input.txnId}`, linkingToken: `mock-link-${input.txnId}` },
      isNewAbha: false,
      mobileMatchesAadhaar: true,
    };
  }

  async suggestAbhaAddress(input: { txnId: string }): Promise<string[]> {
    const txn = this.require(input.txnId);
    const p = profileFor(txn.aadhaar);
    const base = `${p.firstName?.toLowerCase()}${p.lastName?.toLowerCase()}`;
    return [`${base}@sbx`, `${base}${txn.aadhaar.slice(-2)}@sbx`, `${base}.${p.dateOfBirth?.slice(0, 4)}@sbx`];
  }

  async createAbhaAddress(input: { txnId: string; abhaAddress: string }) {
    const txn = this.require(input.txnId);
    if (input.abhaAddress.startsWith('taken')) {
      throw new AbdmGatewayError(409, 'ABDM_ADDRESS_TAKEN', 'That ABHA address is already in use');
    }
    txn.abhaAddress = input.abhaAddress;
    return { abhaAddress: input.abhaAddress, tokens: { xToken: `mock-x-${input.txnId}`, linkingToken: `mock-link-${input.txnId}` } };
  }

  async loginRequestOtp(input: {
    scope: string;
    loginHint: string;
    encryptedLoginId: string;
    otpSystem: string;
    family?: 'profile' | 'phr';
  }): Promise<AbdmOtpResult> {
    const loginId = decrypt(input.encryptedLoginId);
    // Padded at the FRONT and taken from the END, so the identifier's own last digit — which is
    // what selects the scenario — survives. Padding at the back would make every short identifier
    // land on the same scenario as the padding character.
    const seed = loginId.replace(/\D/g, '').padStart(12, '7').slice(-12);
    const txnId = newTxnId(loginId);
    txns.set(txnId, { aadhaar: seed, scenario: scenarioOf(seed) });
    return { txnId, mobileHint: `XXXXXX${seed.slice(-4)}`, devOtp: FIXED_OTP };
  }

  async loginVerify(input: { txnId: string; encryptedOtp: string; scope: string[]; family?: 'profile' | 'phr' }): Promise<AbdmLoginVerifyResult> {
    const txn = this.require(input.txnId);
    this.checkOtp(txn, input.encryptedOtp);
    const profile = profileFor(txn.aadhaar);
    profile.abhaAddress = `${profile.firstName?.toLowerCase()}${txn.aadhaar.slice(-4)}@sbx`;
    // An Aadhaar ending in 5 resolves to two ABHA accounts — the shared-family-mobile case the
    // operator has to disambiguate. Everything else resolves to exactly one.
    const multiple = txn.aadhaar.endsWith('5');
    const second = profileFor(`${txn.aadhaar.slice(0, 11)}8`);
    return {
      txnId: input.txnId,
      tokens: { xToken: `mock-x-${input.txnId}`, linkingToken: `mock-link-${input.txnId}` },
      accounts: multiple
        ? [profile, second].map((p) => ({
            abhaNumber: p.abhaNumber ?? '',
            abhaAddress: p.abhaAddress,
            name: `${p.firstName} ${p.lastName}`,
            gender: p.gender,
            dateOfBirth: p.dateOfBirth,
          }))
        : [],
      profile: multiple ? undefined : profile,
    };
  }

  async loginVerifyUser(input: { txnId: string; abhaNumber: string }): Promise<AbdmEnrolResult> {
    const txn = this.require(input.txnId);
    const profile = profileFor(txn.aadhaar);
    profile.abhaNumber = input.abhaNumber;
    return {
      txnId: input.txnId,
      profile,
      tokens: { xToken: `mock-x-${input.txnId}`, linkingToken: `mock-link-${input.txnId}` },
      isNewAbha: false,
    };
  }

  async getProfile(input: { xToken: string }): Promise<AbdmProfile> {
    const txnId = input.xToken.replace(/^mock-x-/, '');
    return profileFor(this.require(txnId).aadhaar);
  }

  async getAbhaCard(input: { xToken: string }): Promise<AbdmCard> {
    const txnId = input.xToken.replace(/^mock-x-/, '');
    this.require(txnId);
    // A 1x1 PNG. Enough to prove the download path end to end without shipping a fake card that
    // could be mistaken for a real one.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    return { contentType: 'image/png', data: png };
  }

  /** Test seam — clears transaction state between cases. */
  static __reset(): void {
    txns.clear();
  }
}
