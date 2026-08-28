/**
 * The ABDM provider contract (ADR-084, ADR-007 provider pattern).
 *
 * One interface, two implementations: `gateway` (real NHA calls) and `mock` (deterministic,
 * offline). The service layer above depends only on this file, which is what makes the sandbox
 * OTP limit survivable — the sandbox allows a handful of OTPs per number per day, so a codebase
 * that can only run against the real gateway cannot be developed or CI-tested at all.
 *
 * The methods mirror ABDM's own calls rather than our workflow. Business rules — consent,
 * matching, linking to a chart — live in `abdm.service.ts`, so swapping the transport never
 * moves a rule.
 */

/** Demographics as ABDM returns them. Deliberately no Aadhaar field: it is never returned or kept. */
export interface AbdmProfile {
  abhaNumber?: string;
  abhaAddress?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  /** ABDM sends 'M' | 'F' | 'O'; translated to our vocabulary in the service, not here. */
  gender?: string;
  dateOfBirth?: string;
  /** The mobile ABDM holds — may differ from the one the patient wants on the chart. */
  mobile?: string;
  email?: string;
  address?: string;
  districtName?: string;
  stateName?: string;
  pincode?: string;
  /** Base64 JPEG from the ABHA record. Stored as a file, never inlined into a log or an audit row. */
  photoBase64?: string;
}

/** Tokens ABDM hands back. All of them are bearer credentials; none may reach a browser. */
export interface AbdmTokens {
  /** Authenticates further profile calls for this ABHA holder (`X-token`). */
  xToken?: string;
  refreshToken?: string;
  /** The M2 credential. Captured now because it is only offered at verification time. */
  linkingToken?: string;
}

export interface AbdmOtpResult {
  txnId: string;
  /** Masked destination ABDM reports, e.g. `XXXXXX7890`. Shown to the operator, never stored raw. */
  mobileHint?: string;
  /** Sandbox only: the OTP is returned in-band because no SMS is sent. Never present in production. */
  devOtp?: string;
}

export interface AbdmEnrolResult {
  txnId: string;
  profile: AbdmProfile;
  tokens: AbdmTokens;
  /** True when this call created the ABHA; false when the Aadhaar already had one. */
  isNewAbha: boolean;
  /** ABDM's own "is the mobile on this ABHA the Aadhaar-linked one" signal. */
  mobileMatchesAadhaar?: boolean;
}

export interface AbdmLoginVerifyResult {
  txnId: string;
  tokens: AbdmTokens;
  /**
   * One identifier can resolve to several ABHA accounts — a shared family mobile is the common
   * case. When it does, the operator must pick one before a profile exists.
   */
  accounts: Array<{ abhaNumber: string; abhaAddress?: string; name?: string; gender?: string; dateOfBirth?: string }>;
  /** Present when the identifier resolved to exactly one account. */
  profile?: AbdmProfile;
}

/**
 * What may be changed on an ABHA profile.
 *
 * An allow-list, not a passthrough: this writes to a national identity register, and forwarding
 * arbitrary keys to it because a caller supplied them is not a risk worth taking for convenience.
 *
 * `profilePhoto` is the one field the official V3 collection demonstrates for the `X-token`
 * (private-integrator) path. The demographic fields appear there only on the Benefit APIs, which
 * are the Government variant with different authentication — so they are offered here but are
 * **unconfirmed against a live private-sector call**, and NHA's own rejection is surfaced verbatim
 * if it refuses one. Tracked in BACKLOG.md.
 */
export interface AbdmProfilePatch {
  /** Base64 image, as ABDM stores it. */
  profilePhoto?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  gender?: string;
  /** `DD-MM-YYYY`, the format ABDM's own examples use for `dob`. */
  dateOfBirth?: string;
  address?: string;
  pincode?: string;
}

export interface AbdmCard {
  contentType: string;
  data: Buffer;
}

export interface AbdmProvider {
  readonly name: 'gateway' | 'mock';

  /** PEM public certificate used to RSA-encrypt Aadhaar numbers, mobile numbers and OTPs. */
  getPublicCertificate(): Promise<string>;

  // --- Creation ---------------------------------------------------------------------------
  enrolRequestOtp(input: { encryptedAadhaar: string; hipId?: string }): Promise<AbdmOtpResult>;
  enrolByAadhaar(input: { txnId: string; encryptedOtp: string; mobile?: string; hipId?: string }): Promise<AbdmEnrolResult>;
  /** Secondary mobile verification — request, then verify, when the mobile differs from Aadhaar's. */
  enrolMobileRequestOtp(input: { txnId: string; encryptedMobile: string; hipId?: string }): Promise<AbdmOtpResult>;
  enrolMobileVerifyOtp(input: { txnId: string; encryptedOtp: string; hipId?: string }): Promise<AbdmEnrolResult>;
  suggestAbhaAddress(input: { txnId: string; hipId?: string }): Promise<string[]>;
  createAbhaAddress(input: { txnId: string; abhaAddress: string; hipId?: string }): Promise<{ abhaAddress: string; tokens: AbdmTokens }>;

  // --- Verification -----------------------------------------------------------------------
  loginRequestOtp(input: {
    scope: string;
    loginHint: string;
    /** RSA-encrypted identifier — ABHA number, ABHA address, mobile or Aadhaar. */
    encryptedLoginId: string;
    otpSystem: string;
    /**
     * Which API family answers for this identifier. `profile` covers ABHA number, mobile and
     * Aadhaar; `phr` is the separate PHR web-login family that ABHA **addresses** go through.
     * They are different paths with different scopes, so this is not a style choice.
     */
    family: 'profile' | 'phr';
    hipId?: string;
  }): Promise<AbdmOtpResult>;
  loginVerify(input: {
    txnId: string;
    encryptedOtp: string;
    /** The two-element scope array NHA expects, e.g. `['abha-login', 'aadhaar-verify']`. */
    scope: string[];
    family: 'profile' | 'phr';
    hipId?: string;
  }): Promise<AbdmLoginVerifyResult>;
  /** Choose one ABHA when `loginVerify` returned several. */
  loginVerifyUser(input: { txnId: string; abhaNumber: string; token: string; hipId?: string }): Promise<AbdmEnrolResult>;
  getProfile(input: { xToken: string; hipId?: string }): Promise<AbdmProfile>;
  /**
   * Amends the ABHA holder's own profile at ABDM (`PATCH /v3/profile/account`, authenticated with
   * the holder's `X-token`). The field set is an explicit allow-list rather than a passthrough —
   * see `AbdmProfilePatch`.
   */
  updateProfile(input: { xToken: string; patch: AbdmProfilePatch; hipId?: string }): Promise<AbdmProfile>;
  getAbhaCard(input: { xToken: string; hipId?: string }): Promise<AbdmCard>;
}

/**
 * An ABDM-side failure, carried as itself rather than as a generic 500.
 *
 * NHA's messages ("Invalid OTP", "Aadhaar not linked with mobile") are exactly what a
 * receptionist needs to act on, so they are surfaced — after Aadhaar scrubbing — instead of
 * being replaced with generic copy (ADR-057).
 */
export class AbdmGatewayError extends Error {
  constructor(
    public readonly status: number,
    public readonly abdmCode: string | undefined,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AbdmGatewayError';
  }
}
