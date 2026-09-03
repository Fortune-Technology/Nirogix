import { env } from '../../../config/env';
import { logger } from '../../../config/logger';
import { ABHA_PATHS, ABDM_HEADERS, ABDM_SCOPES } from '../abdm.constants';
import { baseHeaders, getAccessToken, invalidateAccessToken } from '../abdm.session';
import {
  AbdmGatewayError,
  type AbdmCard,
  type AbdmEnrolResult,
  type AbdmLoginVerifyResult,
  type AbdmOtpResult,
  type AbdmProfile,
  type AbdmProfilePatch,
  type AbdmProvider,
  type AbdmTokens,
  type PhrAuthMethods,
} from './types';

/**
 * The real ABDM V3 gateway adapter (ADR-084).
 *
 * Every request/response shape below is NHA's, not ours, and **must be verified against the
 * official M1 V3 Postman collection before go-live** — same discipline as the MSG91 adapter:
 * the unverified surface is confined to one file so verification is a review of this file
 * rather than of the module.
 *
 * Response parsing is defensive on purpose. NHA's payloads carry optional blocks that appear
 * only in some flows (`ABHAProfile` vs `profile`, `tokens` vs top-level `token`), and a rigid
 * parser turns a harmless shape difference into a failed registration at the counter.
 */

type Json = Record<string, unknown>;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function pick(source: Json | undefined, ...keys: string[]): unknown {
  if (!source) return undefined;
  for (const k of keys) {
    if (source[k] !== undefined && source[k] !== null) return source[k];
  }
  return undefined;
}

/** Normalises whichever profile block a given V3 response happens to use. */
function toProfile(raw: unknown): AbdmProfile {
  const p = (raw ?? {}) as Json;
  return {
    abhaNumber: str(pick(p, 'ABHANumber', 'abhaNumber', 'healthIdNumber')),
    abhaAddress: str(pick(p, 'phrAddress', 'abhaAddress', 'healthId', 'preferredAbhaAddress')),
    firstName: str(pick(p, 'firstName')),
    middleName: str(pick(p, 'middleName')),
    lastName: str(pick(p, 'lastName')),
    gender: str(pick(p, 'gender')),
    dateOfBirth: toIsoDate(p),
    mobile: str(pick(p, 'mobile', 'mobileNumber')),
    email: str(pick(p, 'email')),
    address: str(pick(p, 'address')),
    districtName: str(pick(p, 'districtName', 'district')),
    stateName: str(pick(p, 'stateName', 'state')),
    pincode: str(pick(p, 'pincode', 'pinCode')),
    photoBase64: str(pick(p, 'photo', 'profilePhoto')),
  };
}

/**
 * ABDM sends the date either as `dob: "01-01-1990"` or as separate `dayOfBirth`/`monthOfBirth`/
 * `yearOfBirth` fields, and a patient with only a birth year is normal (an ABHA can be created
 * from partial demographics). Missing day/month default to 01 so the value is still a storable
 * date rather than being dropped — the operator sees it in the review step and can correct it.
 */
function toIsoDate(p: Json): string | undefined {
  const dob = str(pick(p, 'dob', 'dateOfBirth'));
  if (dob) {
    const dmy = dob.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) return dob;
  }
  const year = pick(p, 'yearOfBirth');
  if (!year) return undefined;
  const pad = (v: unknown, fallback: string) => String(v ?? fallback).padStart(2, '0');
  return `${year}-${pad(pick(p, 'monthOfBirth'), '01')}-${pad(pick(p, 'dayOfBirth'), '01')}`;
}

function toTokens(raw: Json): AbdmTokens {
  const t = (pick(raw, 'tokens') ?? raw) as Json;
  return {
    xToken: str(pick(t, 'token', 'xToken', 'accessToken')),
    refreshToken: str(pick(t, 'refreshToken')),
    linkingToken:
      str(pick(raw, 'linkToken', 'linkingToken')) ?? str(pick(t, 'linkToken', 'linkingToken')),
  };
}

/**
 * Pulls the useful message out of an ABDM error body.
 *
 * NHA uses at least four shapes across the V3 families — a flat `message`, a nested
 * `error.message`, a `details` **array** of `{code, message, attribute}`, and occasionally an
 * `errors` array — so a parser that only knows one of them reports "request failed (400)" and
 * sends the receptionist to support instead of telling them the ABHA does not exist. The details
 * array is the one that matters most in practice: it is where the field-level reason lives.
 */
export function parseAbdmError(text: string, status: number): { code?: string; message: string } {
  const fallback = `ABDM request failed (${status})`;
  let parsed: Json;
  try {
    parsed = JSON.parse(text) as Json;
  } catch {
    // A non-JSON body (an HTML error page from an edge proxy) is not worth putting on a screen,
    // but the caller logs the raw text either way.
    return { message: fallback };
  }

  const firstOf = (value: unknown): { code?: string; message?: string } => {
    const entry = (Array.isArray(value) ? value[0] : value) as Json | undefined;
    return entry
      ? { code: str(pick(entry, 'code', 'errorCode')), message: str(pick(entry, 'message')) }
      : {};
  };

  const nested = firstOf(pick(parsed, 'details', 'errors', 'error'));
  const code = str(pick(parsed, 'code', 'errorCode')) ?? nested.code;
  const message =
    str(pick(parsed, 'message')) ?? nested.message ?? fieldKeyedMessage(parsed) ?? fallback;
  return { code, message };
}

/**
 * The shape NHA's enrolment endpoints actually use: `{"loginId":"Invalid LoginId","timestamp":…}`.
 *
 * The reason is the VALUE and the offending field is the KEY — there is no `message` anywhere. Seen
 * live against the sandbox on 25/08/2026, and it is the reason a rejected enrolment showed up as a
 * bare "request failed (400)" with nothing to act on. Bookkeeping keys are skipped so the timestamp
 * is never mistaken for an explanation.
 */
function fieldKeyedMessage(parsed: Json): string | undefined {
  const bookkeeping = new Set([
    'timestamp',
    'code',
    'errorCode',
    'status',
    'path',
    'traceId',
    'requestId',
  ]);
  for (const [key, value] of Object.entries(parsed)) {
    if (bookkeeping.has(key)) continue;
    const text = str(value);
    if (text) return text;
  }
  return undefined;
}

/**
 * A tri-state flag from a JSON body: true, false, or **absent**.
 *
 * ABDM sends booleans as booleans and, sometimes, as the strings "true"/"false". What it mostly
 * does with `mobileMatchesAadhaar` is not send it at all, and that is not the same as `false`.
 */
function asOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

export class AbdmGatewayProvider implements AbdmProvider {
  readonly name = 'gateway' as const;

  /**
   * One request, with the single retry that matters: NHA can invalidate a session token before
   * its stated expiry, and the correct response to their 401 is a fresh token and one more
   * attempt — not a failed registration. Any other status is surfaced as-is.
   */
  private async call<T>(
    path: string,
    init: {
      method: 'GET' | 'POST' | 'PATCH';
      body?: unknown;
      hipId?: string;
      xToken?: string;
      tToken?: string;
      raw?: boolean;
    },
    retryOn401 = true,
  ): Promise<T> {
    const accessToken = await getAccessToken();
    const headers = baseHeaders(init.hipId);
    headers[ABDM_HEADERS.authorization] = `Bearer ${accessToken}`;
    if (init.xToken) headers[ABDM_HEADERS.xToken] = `Bearer ${init.xToken}`;
    if (init.tToken) headers[ABDM_HEADERS.tToken] = `Bearer ${init.tToken}`;

    const res = await fetch(`${env.ABDM_ABHA_BASE_URL}${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    if (res.status === 401 && retryOn401) {
      invalidateAccessToken();
      return this.call<T>(path, init, false);
    }

    if (!res.ok) {
      const text = await res.text();
      const { code, message } = parseAbdmError(text, res.status);
      // ALWAYS log the raw body. NHA's error shapes vary by API family and by year, and the one
      // thing worse than an unhelpful message on screen is not being able to find out what they
      // actually said. The logger scrubs Aadhaar-shaped values on the way out (ADR-084), so this
      // is safe even though the body can echo the request back.
      logger.error(
        { path, status: res.status, abdmCode: code, body: text.slice(0, 2000) },
        'ABDM rejected a request',
      );
      throw new AbdmGatewayError(res.status, code, message);
    }

    if (init.raw) {
      const buffer = Buffer.from(await res.arrayBuffer());
      return {
        contentType: res.headers.get('content-type') ?? 'application/octet-stream',
        data: buffer,
      } as T;
    }
    return (await res.json()) as T;
  }

  async getPublicCertificate(): Promise<string> {
    const data = await this.call<Json>(ABHA_PATHS.publicCertificate, { method: 'GET' });
    const pem = str(pick(data, 'publicKey', 'certificate', 'key'));
    if (!pem)
      throw new AbdmGatewayError(502, 'ABDM_NO_CERTIFICATE', 'ABDM returned no public certificate');
    return pem;
  }

  async enrolRequestOtp(input: {
    encryptedAadhaar: string;
    hipId?: string;
  }): Promise<AbdmOtpResult> {
    const data = await this.call<Json>(ABHA_PATHS.enrolRequestOtp, {
      method: 'POST',
      hipId: input.hipId,
      body: {
        txnId: '',
        scope: ['abha-enrol'],
        loginHint: 'aadhaar',
        loginId: input.encryptedAadhaar,
        otpSystem: 'aadhaar',
      },
    });
    return {
      txnId: String(pick(data, 'txnId') ?? ''),
      mobileHint: str(pick(data, 'message', 'mobileNumber')),
    };
  }

  async enrolByAadhaar(input: {
    txnId: string;
    encryptedOtp: string;
    mobile?: string;
    hipId?: string;
  }): Promise<AbdmEnrolResult> {
    const data = await this.call<Json>(ABHA_PATHS.enrolByAadhaar, {
      method: 'POST',
      hipId: input.hipId,
      body: {
        authData: {
          authMethods: ['otp'],
          otp: {
            timeStamp: new Date().toISOString(),
            txnId: input.txnId,
            otpValue: input.encryptedOtp,
            mobile: input.mobile,
          },
        },
        consent: { code: 'abha-enrollment', version: '1.4' },
      },
    });
    const profileRaw = pick(data, 'ABHAProfile', 'abhaProfile', 'profile');
    return {
      txnId: String(pick(data, 'txnId') ?? input.txnId),
      profile: toProfile(profileRaw),
      tokens: toTokens(data),
      // NHA reports this as the string 'new' | 'existing' on `isNew`/`new`.
      isNewAbha: String(pick(data, 'isNew', 'new') ?? '').toLowerCase() === 'new',
      // `Boolean(x ?? undefined)` was a no-op that always produced a boolean, so an ABDM
      // response that simply does not carry this field — which is most of them — was recorded as
      // "the mobile does NOT match", and the desk was sent to a second OTP every single time
      // (ADR-131). Absent must stay absent; the service decides what to do with not knowing.
      mobileMatchesAadhaar: asOptionalBoolean(
        pick((profileRaw ?? {}) as Json, 'mobileMatchesAadhaar'),
      ),
    };
  }

  async enrolMobileRequestOtp(input: {
    txnId: string;
    encryptedMobile: string;
    hipId?: string;
  }): Promise<AbdmOtpResult> {
    const data = await this.call<Json>(ABHA_PATHS.enrolRequestOtp, {
      method: 'POST',
      hipId: input.hipId,
      body: {
        txnId: input.txnId,
        scope: ['abha-enrol', 'mobile-verify'],
        loginHint: 'mobile',
        loginId: input.encryptedMobile,
        otpSystem: 'abdm',
      },
    });
    return {
      txnId: String(pick(data, 'txnId') ?? input.txnId),
      mobileHint: str(pick(data, 'message')),
    };
  }

  async enrolMobileVerifyOtp(input: {
    txnId: string;
    encryptedOtp: string;
    hipId?: string;
  }): Promise<AbdmEnrolResult> {
    const data = await this.call<Json>(ABHA_PATHS.enrolAuthByAbdm, {
      method: 'POST',
      hipId: input.hipId,
      body: {
        scope: ['abha-enrol', 'mobile-verify'],
        authData: {
          authMethods: ['otp'],
          otp: {
            txnId: input.txnId,
            otpValue: input.encryptedOtp,
            timeStamp: new Date().toISOString(),
          },
        },
      },
    });
    return {
      txnId: String(pick(data, 'txnId') ?? input.txnId),
      profile: toProfile(pick(data, 'ABHAProfile', 'abhaProfile', 'profile')),
      tokens: toTokens(data),
      isNewAbha: false,
    };
  }

  async suggestAbhaAddress(input: { txnId: string; hipId?: string }): Promise<string[]> {
    // The suggestion API is a GET that carries the transaction in a header, not the query string.
    const accessToken = await getAccessToken();
    const headers = baseHeaders(input.hipId);
    headers[ABDM_HEADERS.authorization] = `Bearer ${accessToken}`;
    headers[ABDM_HEADERS.transactionId] = input.txnId;

    const res = await fetch(`${env.ABDM_ABHA_BASE_URL}${ABHA_PATHS.abhaAddressSuggestion}`, {
      method: 'GET',
      headers,
    });
    if (!res.ok) {
      throw new AbdmGatewayError(
        res.status,
        'ABDM_SUGGESTION_FAILED',
        'Could not fetch ABHA address suggestions',
      );
    }
    const data = (await res.json()) as Json;
    const list = pick(data, 'abhaAddressList', 'phrAddress', 'suggestions');
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string') : [];
  }

  async createAbhaAddress(input: {
    txnId: string;
    abhaAddress: string;
    hipId?: string;
  }): Promise<{ abhaAddress: string; tokens: AbdmTokens }> {
    const data = await this.call<Json>(ABHA_PATHS.abhaAddressCreate, {
      method: 'POST',
      hipId: input.hipId,
      body: { txnId: input.txnId, abhaAddress: input.abhaAddress, preferred: 1 },
    });
    return {
      abhaAddress:
        str(pick(data, 'preferredAbhaAddress', 'abhaAddress', 'healthId')) ?? input.abhaAddress,
      tokens: toTokens(data),
    };
  }

  async loginRequestOtp(input: {
    scope: string;
    loginHint: string;
    encryptedLoginId: string;
    otpSystem: string;
    family: 'profile' | 'phr';
    hipId?: string;
  }): Promise<AbdmOtpResult> {
    // An ABHA address is verified through the PHR web-login family, not the profile-login one.
    const path =
      input.family === 'phr' ? ABHA_PATHS.phrLoginRequestOtp : ABHA_PATHS.loginRequestOtp;
    const data = await this.call<Json>(path, {
      method: 'POST',
      hipId: input.hipId,
      body: {
        scope: [input.scope, input.otpSystem === 'aadhaar' ? 'aadhaar-verify' : 'mobile-verify'],
        loginHint: input.loginHint,
        loginId: input.encryptedLoginId,
        otpSystem: input.otpSystem,
      },
    });
    return { txnId: String(pick(data, 'txnId') ?? ''), mobileHint: str(pick(data, 'message')) };
  }

  async loginVerify(input: {
    txnId: string;
    encryptedOtp: string;
    scope: string[];
    family: 'profile' | 'phr';
    hipId?: string;
  }): Promise<AbdmLoginVerifyResult> {
    const path = input.family === 'phr' ? ABHA_PATHS.phrLoginVerify : ABHA_PATHS.loginVerify;
    const data = await this.call<Json>(path, {
      method: 'POST',
      hipId: input.hipId,
      body: {
        // BOTH scopes, exactly as the request/otp call sent them. A single-element array is
        // accepted by nothing: the collection pairs `abha-login` with the verify method every time.
        scope: input.scope,
        authData: {
          authMethods: ['otp'],
          otp: { txnId: input.txnId, otpValue: input.encryptedOtp },
        },
      },
    });
    const accountsRaw = pick(data, 'accounts', 'ABHAProfile');
    const accounts = Array.isArray(accountsRaw)
      ? accountsRaw.map((a) => {
          const p = toProfile(a);
          return {
            abhaNumber: p.abhaNumber ?? '',
            abhaAddress: p.abhaAddress,
            name: [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ') || undefined,
            gender: p.gender,
            dateOfBirth: p.dateOfBirth,
          };
        })
      : [];
    const single = !Array.isArray(accountsRaw) && accountsRaw ? toProfile(accountsRaw) : undefined;
    return {
      txnId: String(pick(data, 'txnId') ?? input.txnId),
      tokens: toTokens(data),
      accounts,
      profile: single,
    };
  }

  async phrSearchAuthMethods(input: {
    encryptedAbhaAddress: string;
    hipId?: string;
  }): Promise<PhrAuthMethods> {
    const data = await this.call<Json>(ABHA_PATHS.phrLoginSearch, {
      method: 'POST',
      hipId: input.hipId,
      body: { abhaAddress: input.encryptedAbhaAddress, scope: [ABDM_SCOPES.abhaAddressLogin] },
    });
    const raw = pick(data, 'authMethods', 'authMethod', 'authTypes');
    const methods = Array.isArray(raw) ? raw.map((m) => String(m).toUpperCase()) : [];
    return { txnId: str(pick(data, 'txnId')), authMethods: methods };
  }

  async loginVerifyUser(input: {
    txnId: string;
    abhaNumber: string;
    token: string;
    hipId?: string;
  }): Promise<AbdmEnrolResult> {
    const data = await this.call<Json>(ABHA_PATHS.loginVerifyUser, {
      method: 'POST',
      hipId: input.hipId,
      // `T-token`, NOT `X-token`. They are different credentials for different calls, and the
      // wrong one answers 401 in a way that reads like the client credentials are broken.
      tToken: input.token,
      body: { ABHANumber: input.abhaNumber, txnId: input.txnId },
    });
    return {
      txnId: String(pick(data, 'txnId') ?? input.txnId),
      profile: toProfile(pick(data, 'ABHAProfile', 'abhaProfile', 'profile')),
      tokens: toTokens(data),
      isNewAbha: false,
    };
  }

  async getProfile(input: {
    xToken: string;
    hipId?: string;
    family?: 'profile' | 'phr';
  }): Promise<AbdmProfile> {
    // A PHR-family token is only accepted by the PHR family's own profile path. Reading an
    // ABHA-address verification from `/v3/profile/account` answers 401, which reads like a
    // credential fault and is really a wrong-endpoint one.
    const path = input.family === 'phr' ? ABHA_PATHS.phrProfile : ABHA_PATHS.profileAccount;
    const data = await this.call<Json>(path, {
      method: 'GET',
      hipId: input.hipId,
      xToken: input.xToken,
    });
    return toProfile(data);
  }

  async updateProfile(input: {
    xToken: string;
    patch: AbdmProfilePatch;
    hipId?: string;
  }): Promise<AbdmProfile> {
    // Only the keys the caller actually set, under ABDM's own field names. `dob` rather than
    // `dateOfBirth`, and the name split into its three parts, because that is what their profile
    // record holds — sending our vocabulary would be rejected field by field.
    const body: Record<string, unknown> = {};
    const { patch } = input;
    if (patch.profilePhoto !== undefined) body.profilePhoto = patch.profilePhoto;
    if (patch.firstName !== undefined) body.firstName = patch.firstName;
    if (patch.middleName !== undefined) body.middleName = patch.middleName;
    if (patch.lastName !== undefined) body.lastName = patch.lastName;
    if (patch.gender !== undefined) body.gender = patch.gender;
    if (patch.dateOfBirth !== undefined) body.dob = patch.dateOfBirth;
    if (patch.address !== undefined) body.address = patch.address;
    if (patch.pincode !== undefined) body.pincode = patch.pincode;

    const data = await this.call<Json>(ABHA_PATHS.profileAccount, {
      method: 'PATCH',
      hipId: input.hipId,
      xToken: input.xToken,
      body,
    });
    // Some responses echo the updated profile, some acknowledge only. Falling back to a fresh read
    // means the caller always gets the profile as ABDM now holds it, not as we hoped it would.
    const echoed = toProfile(pick(data, 'ABHAProfile', 'abhaProfile', 'profile') ?? data);
    return echoed.abhaNumber || echoed.firstName
      ? echoed
      : this.getProfile({ xToken: input.xToken, hipId: input.hipId });
  }

  async getAbhaCard(input: {
    xToken: string;
    hipId?: string;
    family?: 'profile' | 'phr';
  }): Promise<AbdmCard> {
    // Same rule as `getProfile`: the ABHA card of an address-verified holder is served by the
    // PHR family (`/v3/phr/web/login/profile/abha/phr-card`), and only to its own token.
    const path = input.family === 'phr' ? ABHA_PATHS.phrCard : ABHA_PATHS.abhaCard;
    return this.call<AbdmCard>(path, {
      method: 'GET',
      hipId: input.hipId,
      xToken: input.xToken,
      raw: true,
    });
  }
}
