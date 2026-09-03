import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import {
  abdmFacilityConfig,
  abdmTransactions,
  patients,
  type AbdmTransaction,
  type Patient,
} from '../../db/schema';
import { AppError, Errors } from '../../http/error';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { writeAudit } from '../audit/audit.service';
import { encryptSecret, isEncryptionConfigured, tryDecryptSecret } from '../../security/encryption';
import { maskAadhaar, maskMobile, scrubAadhaar } from '../../security/redaction';
import { abdmProvider } from './providers';
import {
  AbdmGatewayError,
  type AbdmProfile,
  type AbdmProfilePatch,
  type AbdmTokens,
} from './providers/types';
import { encryptForAbdm } from './abdm.crypto';
import { ABDM_SCOPES, LOGIN_HINTS, OTP_SYSTEMS } from './abdm.constants';

/**
 * ABDM Milestone 1 — ABHA creation and verification at registration (ADR-084).
 *
 * Everything ABDM-specific that is a *rule* rather than a *wire format* lives here: consent
 * before an Aadhaar OTP, the raw Aadhaar never outliving the request, tokens encrypted before
 * they touch a row, and the new-vs-returning decision. The wire formats live behind
 * `providers/`, so this file reads the same whether it is talking to NHA or to the mock.
 *
 * The invariant worth stating once: **ABDM verifies an identity, it does not create a chart.**
 * Every flow ends at a *prefill* the operator reviews and submits through the ordinary patient
 * registration endpoint, or at a *link* onto a chart that already exists. Nothing here writes a
 * clinical record on its own.
 */

// ---------------------------------------------------------------------------------------------
// Facility configuration (per tenant)
// ---------------------------------------------------------------------------------------------

export type FacilityConfigInput = {
  hipId: string;
  facilityName?: string | null;
  qrContent?: string | null;
  scanShareEnabled?: boolean;
  branchId?: string | null;
};

export async function getFacilityConfig(tenantId: string, branchId?: string | null) {
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(abdmFacilityConfig)
      .where(
        and(
          eq(abdmFacilityConfig.tenantId, tenantId),
          branchId
            ? eq(abdmFacilityConfig.branchId, branchId)
            : isNull(abdmFacilityConfig.branchId),
        ),
      )
      .limit(1);
    // A branch with no facility of its own falls back to the organization's — the common case,
    // since most hospitals register one HFR facility for the whole organization.
    if (rows[0] || !branchId) return rows[0] ?? null;
    const orgRows = await tx
      .select()
      .from(abdmFacilityConfig)
      .where(and(eq(abdmFacilityConfig.tenantId, tenantId), isNull(abdmFacilityConfig.branchId)))
      .limit(1);
    return orgRows[0] ?? null;
  });
}

export async function upsertFacilityConfig(
  tenantId: string,
  data: FacilityConfigInput,
  actorUserId?: string,
) {
  const row = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .insert(abdmFacilityConfig)
      .values({
        tenantId,
        branchId: data.branchId ?? null,
        hipId: data.hipId,
        facilityName: data.facilityName ?? null,
        qrContent: data.qrContent ?? null,
        scanShareEnabled: data.scanShareEnabled ?? false,
        createdBy: actorUserId ?? null,
      })
      .onConflictDoUpdate({
        target: [abdmFacilityConfig.tenantId, abdmFacilityConfig.branchId],
        set: {
          hipId: data.hipId,
          facilityName: data.facilityName ?? null,
          qrContent: data.qrContent ?? null,
          scanShareEnabled: data.scanShareEnabled ?? false,
          updatedAt: new Date(),
        },
      })
      .returning();
    return rows[0]!;
  });
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'abdm.facility.configure',
    resourceType: 'abdm_facility_config',
    resourceId: row.id,
    severity: 'notice',
    metadata: { hipId: row.hipId, scanShareEnabled: row.scanShareEnabled },
  });
  return row;
}

/** The HFR facility id for outbound calls. Absent is a valid state, not an error. */
async function hipIdFor(tenantId: string, branchId?: string | null): Promise<string | undefined> {
  const config = await getFacilityConfig(tenantId, branchId);
  return config?.hipId ?? undefined;
}

// ---------------------------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------------------------

type StartTxnInput = {
  tenantId: string;
  branchId?: string | null;
  flow: string;
  identifierHint?: string;
  consentAt?: Date | null;
  actorUserId?: string;
};

function expiry(): Date {
  return new Date(Date.now() + env.ABDM_TXN_TTL_SECONDS * 1000);
}

async function createTransaction(input: StartTxnInput, txnId?: string): Promise<AbdmTransaction> {
  return runWithTenant(input.tenantId, async (tx) => {
    const rows = await tx
      .insert(abdmTransactions)
      .values({
        tenantId: input.tenantId,
        branchId: input.branchId ?? null,
        txnId: txnId ?? null,
        flow: input.flow,
        state: 'otp_sent',
        identifierHint: input.identifierHint ?? null,
        consentAt: input.consentAt ?? null,
        consentVersion: input.consentAt ? env.ABDM_CONSENT_VERSION : null,
        initiatedBy: input.actorUserId ?? null,
        expiresAt: expiry(),
      })
      .returning();
    return rows[0]!;
  });
}

async function loadTransaction(tenantId: string, id: string): Promise<AbdmTransaction> {
  const row = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(abdmTransactions)
      .where(and(eq(abdmTransactions.tenantId, tenantId), eq(abdmTransactions.id, id)))
      .limit(1);
    return rows[0] ?? null;
  });
  if (!row) throw Errors.notFound('This ABDM verification was not found');
  if (row.expiresAt.getTime() < Date.now() && row.state !== 'completed') {
    throw new AppError(
      410,
      'ABDM_TXN_EXPIRED',
      'This verification has expired. Please start again.',
    );
  }
  return row;
}

async function updateTransaction(
  tenantId: string,
  id: string,
  patch: Partial<AbdmTransaction>,
): Promise<AbdmTransaction> {
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .update(abdmTransactions)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(abdmTransactions.tenantId, tenantId), eq(abdmTransactions.id, id)))
      .returning();
    return rows[0]!;
  });
}

/**
 * Stores the tokens ABDM handed back.
 *
 * The linking token is the M2 credential and is only ever offered at verification time, so it is
 * captured now even though M1 does not use it. If encryption is not configured it is **dropped**,
 * not stored in the clear — losing a token costs one re-verification later, while a plaintext
 * bearer credential in a database costs considerably more.
 */
function encryptLinkingToken(tokens: AbdmTokens): string | null {
  return encryptToken(tokens.linkingToken, 'linking token');
}

/**
 * Encrypts one ABDM token for storage, or drops it.
 *
 * If encryption is not configured the token is **discarded**, never stored in the clear —
 * losing it costs one re-verification, while a plaintext bearer credential in a database costs
 * considerably more.
 */
function encryptToken(token: string | undefined, label: string): string | null {
  if (!token) return null;
  if (!isEncryptionConfigured()) {
    logger.warn({ label }, 'ABDM token discarded — ENCRYPTION_KEY is not configured');
    return null;
  }
  return encryptSecret(token);
}

/**
 * The profile token for a transaction. Absent is a real state (encryption unconfigured, or the
 * flow never produced one), and the caller turns it into a clear message rather than a 500.
 */
function profileToken(txn: AbdmTransaction): string {
  const token = tryDecryptSecret(txn.xTokenEnc);
  if (!token) {
    throw new AppError(
      422,
      'ABDM_NO_PROFILE_TOKEN',
      'This verification cannot be continued. Please verify the ABHA again.',
    );
  }
  return token;
}

// ---------------------------------------------------------------------------------------------
// Patient matching — the mandatory new-vs-returning M1 test case
// ---------------------------------------------------------------------------------------------

export type MatchCandidate = {
  id: string;
  uhid: string;
  firstName: string;
  lastName: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  abhaNumber: string | null;
  /** exact_abha | demographic — why this chart came back. */
  reason: 'exact_abha' | 'demographic';
};

export type MatchResult = {
  /** returning = one confident match; ambiguous = several; new = none. */
  outcome: 'returning' | 'ambiguous' | 'new';
  candidates: MatchCandidate[];
};

/**
 * Decides whether this verified ABHA already has a chart here.
 *
 * Two passes, in NHA's recommended order:
 *
 * 1. **ABHA number, exactly.** A verified ABHA number is a national identifier — one match is
 *    conclusive and ends the search.
 * 2. **Demographics** — name + gender + year of birth. Deliberately *not* automatic: a
 *    demographic hit is offered to the operator as a candidate to confirm, never merged
 *    silently. Two people can share a name, a gender and a birth year, and merging the wrong
 *    charts is a clinical safety incident, not a data-quality one.
 *
 * Only the number match is treated as `returning` on its own; anything demographic comes back as
 * `ambiguous` so a human decides.
 */
export async function matchPatient(tenantId: string, profile: AbdmProfile): Promise<MatchResult> {
  const abha = profile.abhaNumber?.replace(/\D/g, '');
  const rows = await runWithTenant(tenantId, async (tx) => {
    if (abha) {
      const exact = await tx
        .select()
        .from(patients)
        .where(
          and(
            eq(patients.tenantId, tenantId),
            eq(patients.status, 'active'),
            // Compare digits only: an ABHA number is written both `12-3456-7890-1234` and bare.
            sql`regexp_replace(coalesce(${patients.abhaNumber}, ''), '[^0-9]', '', 'g') = ${abha}`,
          ),
        )
        .limit(5);
      if (exact.length > 0) return { rows: exact, reason: 'exact_abha' as const };
    }

    const first = profile.firstName?.trim();
    const year = profile.dateOfBirth?.slice(0, 4);
    if (!first || !year) return { rows: [] as Patient[], reason: 'demographic' as const };

    const demographic = await tx
      .select()
      .from(patients)
      .where(
        and(
          eq(patients.tenantId, tenantId),
          eq(patients.status, 'active'),
          sql`lower(${patients.firstName}) = lower(${first})`,
          sql`extract(year from ${patients.dateOfBirth}) = ${Number(year)}`,
          profile.gender
            ? sql`lower(coalesce(${patients.gender}, '')) = lower(${normaliseGender(profile.gender) ?? ''})`
            : sql`true`,
        ),
      )
      .limit(5);
    return { rows: demographic, reason: 'demographic' as const };
  });

  const candidates: MatchCandidate[] = rows.rows.map((p) => ({
    id: p.id,
    uhid: p.uhid,
    firstName: p.firstName,
    lastName: p.lastName,
    gender: p.gender,
    dateOfBirth: p.dateOfBirth,
    phone: p.phone,
    abhaNumber: p.abhaNumber,
    reason: rows.reason,
  }));

  if (candidates.length === 0) return { outcome: 'new', candidates };
  if (rows.reason === 'exact_abha' && candidates.length === 1)
    return { outcome: 'returning', candidates };
  return { outcome: 'ambiguous', candidates };
}

/** ABDM sends M/F/O; the chart stores male/female/other. */
function normaliseGender(gender?: string): string | null {
  if (!gender) return null;
  const g = gender.trim().toLowerCase();
  if (g === 'm' || g === 'male') return 'male';
  if (g === 'f' || g === 'female') return 'female';
  return 'other';
}

/** The registration form's shape, filled from a verified ABHA profile. Editable before submit. */
export type AbhaPrefill = {
  firstName?: string;
  lastName?: string;
  gender?: string | null;
  dateOfBirth?: string;
  phone?: string;
  email?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  pincode?: string;
  abhaNumber?: string;
  abhaAddress?: string;
};

function toPrefill(profile: AbdmProfile): AbhaPrefill {
  const lastName = [profile.middleName, profile.lastName].filter(Boolean).join(' ').trim();
  return {
    firstName: profile.firstName,
    lastName: lastName || undefined,
    gender: normaliseGender(profile.gender),
    dateOfBirth: profile.dateOfBirth,
    phone: profile.mobile,
    email: profile.email,
    addressLine: profile.address,
    city: profile.districtName,
    state: profile.stateName,
    pincode: profile.pincode,
    abhaNumber: profile.abhaNumber,
    abhaAddress: profile.abhaAddress,
  };
}

/** What every flow returns once a profile exists: a prefill plus the matching decision. */
export type VerificationResult = {
  transactionId: string;
  state: string;
  prefill: AbhaPrefill;
  match: MatchResult;
  isNewAbha?: boolean;
  /** True when the mobile the patient wants differs from Aadhaar's — the secondary OTP is due. */
  requiresMobileVerification?: boolean;
  /** Set when the ABHA was just created and has no ABHA address yet. */
  requiresAbhaAddress?: boolean;
  /** Present only when several ABHA accounts share the identifier and one must be chosen. */
  /** The demographics the list carries are kept: they are what fills the form when one is picked (ADR-130). */
  accounts?: Array<{
    abhaNumber: string;
    abhaAddress?: string;
    name?: string;
    gender?: string;
    dateOfBirth?: string;
  }>;
};

/**
 * Everything ABDM has told us about this person **so far**, newest answer winning per field
 * (ADR-130).
 *
 * A verification is several calls, and each one answers a different amount. Aadhaar OTP returns
 * the whole demographic record; the mobile OTP that follows it returns almost nothing; picking an
 * ABHA from a list returns a token and little else. Taking the last response as *the* profile
 * therefore threw away everything the earlier steps had established — the desk watched a filled
 * card turn into "Unnamed · Not specified · DOB unknown · no phone" on the final step.
 *
 * A later step can only **add or correct**, never blank: an absent field means "this call did not
 * say", which is not the same as "this person has no name".
 */
function mergeProfiles(known: AbdmProfile | null | undefined, incoming: AbdmProfile): AbdmProfile {
  const merged: Record<string, unknown> = { ...(known ?? {}) };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    merged[key] = value;
  }
  return merged as AbdmProfile;
}

/** The demographics already recorded against this transaction, if an earlier step stored any. */
function storedProfile(txn: AbdmTransaction): AbdmProfile | null {
  const raw = (txn as { profile?: unknown }).profile;
  return raw && typeof raw === 'object' ? (raw as AbdmProfile) : null;
}

async function completeWithProfile(
  tenantId: string,
  txn: AbdmTransaction,
  incoming: AbdmProfile,
  tokens: AbdmTokens,
  extra: { isNewAbha?: boolean; requiresMobileVerification?: boolean; actorUserId?: string } = {},
): Promise<VerificationResult> {
  // What this step returned, laid over what the transaction already knew.
  const profile = mergeProfiles(storedProfile(txn), incoming);
  const match = await matchPatient(tenantId, profile);
  const updated = await updateTransaction(tenantId, txn.id, {
    state: 'verified',
    // Never blank an identifier a previous step established: `?? null` on the incoming value alone
    // wiped the ABHA number on the second call of every two-step flow.
    abhaNumber: profile.abhaNumber ?? txn.abhaNumber ?? null,
    abhaAddress: profile.abhaAddress ?? txn.abhaAddress ?? null,
    // The stored profile is what the operator reviews and what a later support question is
    // answered from. It is demographics only — no Aadhaar, no token.
    profile: scrubAadhaar(profile as unknown as Record<string, unknown>),
    linkingTokenEnc: encryptLinkingToken(tokens),
    xTokenEnc: encryptToken(tokens.xToken, 'profile token'),
    matchOutcome: match.outcome,
  } as Partial<AbdmTransaction>);

  await writeAudit({
    tenantId,
    actorUserId: extra.actorUserId ?? null,
    action: 'abdm.verification.completed',
    resourceType: 'abdm_transaction',
    resourceId: txn.id,
    severity: 'notice',
    metadata: { flow: txn.flow, matchOutcome: match.outcome, isNewAbha: extra.isNewAbha ?? false },
  });

  return {
    transactionId: updated.id,
    state: updated.state,
    prefill: toPrefill(profile),
    match,
    isNewAbha: extra.isNewAbha,
    requiresMobileVerification: extra.requiresMobileVerification,
    requiresAbhaAddress: extra.isNewAbha === true && !profile.abhaAddress,
  };
}

/**
 * Converts a provider failure into our error shape.
 *
 * ABDM's own message is kept — "Aadhaar not linked with a mobile number" tells a receptionist
 * exactly what to do next, and replacing it with generic copy would make the counter slower
 * (ADR-057). It is scrubbed first, because an ABDM error body can echo the input back.
 */
function toAppError(err: unknown): AppError {
  if (err instanceof AbdmGatewayError) {
    const status = err.status >= 400 && err.status < 500 ? err.status : 502;
    return new AppError(status, err.abdmCode ?? 'ABDM_ERROR', scrubAadhaar(err.message));
  }
  if (err instanceof AppError) return err;
  logger.error({ err }, 'Unexpected ABDM failure');
  return new AppError(
    502,
    'ABDM_UNAVAILABLE',
    'ABDM is not responding. Continue with manual registration.',
  );
}

// ---------------------------------------------------------------------------------------------
// Flow 1 — create an ABHA with Aadhaar OTP
// ---------------------------------------------------------------------------------------------

/**
 * Sends the Aadhaar OTP.
 *
 * The Aadhaar number is a parameter and nothing else: it is encrypted, sent, and left to go out
 * of scope. What persists is `identifierHint` (`XXXXXXXX1234`). Consent is checked *before* the
 * call, not recorded after it — an OTP that reached a patient's phone without consent has
 * already happened by the time an after-the-fact check would run.
 */
/**
 * The OTP allowance for one verification: the first send plus two resends (`CRT_ABHA_106`).
 * UIDAI limits how many OTPs a number may receive in a day, so this protects the patient's
 * allowance as much as it satisfies the certification case.
 */
const MAX_OTP_SENDS = 3;
const OTP_RESEND_GAP_MS = 60_000;

export async function startAadhaarEnrolment(
  tenantId: string,
  input: { aadhaar: string; consentGiven: boolean; branchId?: string | null },
  actorUserId?: string,
): Promise<{ transactionId: string; mobileHint?: string; devOtp?: string }> {
  if (!input.consentGiven) {
    throw new AppError(
      422,
      'ABDM_CONSENT_REQUIRED',
      "Record the patient's consent before sending an Aadhaar OTP",
    );
  }
  const aadhaarDigits = input.aadhaar.replace(/\D/g, '');
  if (!/^\d{12}$/.test(aadhaarDigits)) {
    throw new AppError(422, 'ABDM_INVALID_AADHAAR', 'Enter a 12-digit Aadhaar number');
  }

  const provider = abdmProvider();
  const hipId = await hipIdFor(tenantId, input.branchId);
  const txn = await createTransaction({
    tenantId,
    branchId: input.branchId,
    flow: 'enrol_aadhaar',
    identifierHint: maskAadhaar(aadhaarDigits),
    consentAt: new Date(),
    actorUserId,
  });

  try {
    const encrypted = await encryptForAbdm(provider, aadhaarDigits);
    const otp = await provider.enrolRequestOtp({ encryptedAadhaar: encrypted, hipId });
    // `lastOtpAt` is stamped on the FIRST send too — otherwise the sixty-second gap has nothing to
    // measure from and the first resend is free.
    await updateTransaction(tenantId, txn.id, { txnId: otp.txnId, lastOtpAt: new Date() });
    await writeAudit({
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'abdm.aadhaar.otp.requested',
      resourceType: 'abdm_transaction',
      resourceId: txn.id,
      severity: 'notice',
      metadata: { identifierHint: txn.identifierHint, consentVersion: env.ABDM_CONSENT_VERSION },
    });
    return { transactionId: txn.id, mobileHint: otp.mobileHint, devOtp: otp.devOtp };
  } catch (err) {
    await updateTransaction(tenantId, txn.id, { state: 'failed', failureCode: errCode(err) });
    throw toAppError(err);
  }
}

function errCode(err: unknown): string {
  return err instanceof AbdmGatewayError ? (err.abdmCode ?? String(err.status)) : 'UNKNOWN';
}

/** Verifies the Aadhaar OTP and returns the profile, the prefill and the matching decision. */
export async function verifyAadhaarOtp(
  tenantId: string,
  input: { transactionId: string; otp: string; mobile?: string },
  actorUserId?: string,
): Promise<VerificationResult> {
  const txn = await loadTransaction(tenantId, input.transactionId);
  const provider = abdmProvider();
  const hipId = await hipIdFor(tenantId, txn.branchId);

  try {
    const encryptedOtp = await encryptForAbdm(provider, input.otp);
    const result = await provider.enrolByAadhaar({
      txnId: txn.txnId ?? '',
      encryptedOtp,
      mobile: input.mobile,
      hipId,
    });
    if (result.txnId && result.txnId !== txn.txnId) {
      await updateTransaction(tenantId, txn.id, { txnId: result.txnId });
    }
    // A second OTP is due only when the desk asked for a mobile ABDM does **not** already hold
    // (ADR-131).
    //
    // This used to fire whenever a mobile was typed at all, because the gateway reported an absent
    // `mobileMatchesAadhaar` as `false`. The number the operator types is almost always the
    // Aadhaar-linked one — it is the number that just received the first OTP — so the common case
    // was two OTPs to the same phone for no reason.
    //
    // The numbers themselves are the decisive test: if what was asked for is what ABDM holds,
    // there is nothing left to prove, whatever the flag says. Where they differ, ABDM's own
    // `true` still short-circuits it, and not knowing means asking.
    const requestedMobile = input.mobile?.replace(/\D/g, '') || undefined;
    const mobileOnRecord = result.profile.mobile?.replace(/\D/g, '') || undefined;
    const requiresMobileVerification =
      Boolean(requestedMobile) &&
      requestedMobile !== mobileOnRecord &&
      result.mobileMatchesAadhaar !== true;
    return await completeWithProfile(
      tenantId,
      { ...txn, txnId: result.txnId || txn.txnId },
      result.profile,
      result.tokens,
      {
        isNewAbha: result.isNewAbha,
        requiresMobileVerification,
        actorUserId,
      },
    );
  } catch (err) {
    await updateTransaction(tenantId, txn.id, { state: 'failed', failureCode: errCode(err) });
    throw toAppError(err);
  }
}

/**
 * The secondary mobile verification.
 *
 * Runs when the patient wants a mobile number that Aadhaar does not carry. It is a distinct
 * ABDM sub-flow, not a formality — it changes which linking token comes back, and skipping it
 * produces a token that fails later at M2 care-context linking.
 */
/**
 * Sends the OTP again for a transaction already in flight (ADR-100, `CRT_ABHA_106`).
 *
 * ABDM publishes **no resend endpoint** — a resend is the same request repeated — so the rule the
 * certification case states ("maximum 2 times after 60 seconds") is entirely ours to enforce, and
 * it is enforced **on the transaction, not in the browser**: a reloaded page, a second tab or a
 * direct API call must not be able to spend a patient's daily UIDAI allowance.
 *
 * The Aadhaar flow needs the number supplied again, and that is deliberate rather than an
 * oversight. We never store an Aadhaar (ADR-084), so there is nothing to replay; the browser still
 * holds what the receptionist typed, and re-sending it costs nothing while storing it would create
 * exactly the liability the whole design avoids. The transaction is reused, so the resend counts
 * against the same allowance instead of quietly starting a fresh one.
 */
export async function resendOtp(
  tenantId: string,
  input: { transactionId: string; aadhaar?: string; mobile?: string; identifier?: string },
  actorUserId?: string,
): Promise<{ transactionId: string; mobileHint?: string; devOtp?: string; resendsLeft: number }> {
  const txn = await loadTransaction(tenantId, input.transactionId);

  if (txn.consumedAt) {
    throw new AppError(409, 'ABDM_TXN_ALREADY_USED', 'This verification is already finished');
  }
  if (txn.expiresAt && txn.expiresAt <= new Date()) {
    throw new AppError(
      410,
      'ABDM_TXN_EXPIRED',
      'This verification has expired. Please start again.',
    );
  }

  const sent = txn.otpSends ?? 1;
  if (sent >= MAX_OTP_SENDS) {
    throw new AppError(
      429,
      'ABDM_OTP_RESEND_LIMIT',
      'The code has already been sent three times. Please start the verification again.',
    );
  }
  const since = txn.lastOtpAt ? Date.now() - txn.lastOtpAt.getTime() : Number.POSITIVE_INFINITY;
  if (since < OTP_RESEND_GAP_MS) {
    const wait = Math.ceil((OTP_RESEND_GAP_MS - since) / 1000);
    throw new AppError(
      429,
      'ABDM_OTP_TOO_SOON',
      `Please wait ${wait} more second${wait === 1 ? '' : 's'} before resending`,
    );
  }

  let result: { transactionId: string; mobileHint?: string; devOtp?: string };
  if (txn.flow === 'enrol_aadhaar' && input.aadhaar) {
    // A fresh send against the SAME transaction — see the note above on why the number is re-supplied.
    const digits = input.aadhaar.replace(/\D/g, '');
    if (!/^\d{12}$/.test(digits))
      throw new AppError(422, 'ABDM_INVALID_AADHAAR', 'Enter a 12-digit Aadhaar number');
    const provider = abdmProvider();
    const hipId = await hipIdFor(tenantId, txn.branchId);
    const encrypted = await encryptForAbdm(provider, digits);
    const otp = await provider.enrolRequestOtp({ encryptedAadhaar: encrypted, hipId });
    await updateTransaction(tenantId, txn.id, { txnId: otp.txnId });
    result = { transactionId: txn.id, mobileHint: otp.mobileHint, devOtp: otp.devOtp };
  } else if (txn.flow.startsWith('login_')) {
    // A VERIFICATION resend (`VRFY_ABHA_305`, `_405`, and the resend clause on every other
    // verification case). It repeats the ORIGINAL login OTP request — same identifier, same
    // family, same OTP system — rather than the enrolment mobile-update call below, which is a
    // different endpoint and would answer with a transaction this flow cannot verify against.
    const identifier = (input.identifier ?? input.mobile ?? '').trim();
    if (!identifier) {
      throw new AppError(
        422,
        'ABDM_RESEND_NEEDS_IDENTIFIER',
        'Re-enter the identifier to resend the code',
      );
    }
    const type = flowToType(txn.flow);
    const config = HINT_BY_TYPE[type];
    const value = type === 'abha_address' ? identifier : identifier.replace(/[^0-9]/g, '');
    const provider = abdmProvider();
    const hipId = await hipIdFor(tenantId, txn.branchId);
    const encrypted = await encryptForAbdm(provider, value);
    const otp = await provider.loginRequestOtp({
      scope: config.scope,
      loginHint: config.hint,
      encryptedLoginId: encrypted,
      otpSystem: otpSystemOfFlow(txn.flow, type),
      family: config.family,
      hipId,
    });
    await updateTransaction(tenantId, txn.id, { txnId: otp.txnId });
    result = { transactionId: txn.id, mobileHint: otp.mobileHint, devOtp: otp.devOtp };
  } else if (input.mobile) {
    // The mobile flow needs no re-entry: ABDM keys it on the transaction, not on the number.
    result = await requestMobileOtp(
      tenantId,
      { transactionId: txn.id, mobile: input.mobile },
      actorUserId,
    );
  } else {
    throw new AppError(
      422,
      'ABDM_RESEND_NEEDS_IDENTIFIER',
      'Re-enter the Aadhaar or mobile number to resend the code',
    );
  }

  await updateTransaction(tenantId, txn.id, { otpSends: sent + 1, lastOtpAt: new Date() });
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'abdm.otp.resent',
    resourceType: 'abdm_transaction',
    resourceId: txn.id,
    severity: 'notice',
    // The count and the flow, never the identifier that was re-sent.
    metadata: { attempt: sent + 1, flow: txn.flow },
  });

  return { ...result, resendsLeft: MAX_OTP_SENDS - (sent + 1) };
}

export async function requestMobileOtp(
  tenantId: string,
  input: { transactionId: string; mobile: string },
  actorUserId?: string,
): Promise<{ transactionId: string; mobileHint?: string; devOtp?: string }> {
  const txn = await loadTransaction(tenantId, input.transactionId);
  const provider = abdmProvider();
  const hipId = await hipIdFor(tenantId, txn.branchId);
  const digits = input.mobile.replace(/\D/g, '');
  if (!/^\d{10}$/.test(digits))
    throw new AppError(422, 'ABDM_INVALID_MOBILE', 'Enter a 10-digit mobile number');

  try {
    const encrypted = await encryptForAbdm(provider, digits);
    const otp = await provider.enrolMobileRequestOtp({
      txnId: txn.txnId ?? '',
      encryptedMobile: encrypted,
      hipId,
    });
    await updateTransaction(tenantId, txn.id, {
      txnId: otp.txnId,
      identifierHint: maskMobile(digits),
      lastOtpAt: new Date(),
    });
    await writeAudit({
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'abdm.mobile.otp.requested',
      resourceType: 'abdm_transaction',
      resourceId: txn.id,
      metadata: { mobileHint: maskMobile(digits) },
    });
    return { transactionId: txn.id, mobileHint: otp.mobileHint, devOtp: otp.devOtp };
  } catch (err) {
    throw toAppError(err);
  }
}

export async function verifyMobileOtp(
  tenantId: string,
  input: { transactionId: string; otp: string },
  actorUserId?: string,
): Promise<VerificationResult> {
  const txn = await loadTransaction(tenantId, input.transactionId);
  const provider = abdmProvider();
  const hipId = await hipIdFor(tenantId, txn.branchId);
  try {
    const encryptedOtp = await encryptForAbdm(provider, input.otp);
    const result = await provider.enrolMobileVerifyOtp({
      txnId: txn.txnId ?? '',
      encryptedOtp,
      hipId,
    });
    return await completeWithProfile(tenantId, txn, result.profile, result.tokens, { actorUserId });
  } catch (err) {
    throw toAppError(err);
  }
}

// ---------------------------------------------------------------------------------------------
// ABHA address (the human-readable @ handle) — mandatory for a newly created ABHA
// ---------------------------------------------------------------------------------------------

export async function suggestAbhaAddresses(
  tenantId: string,
  transactionId: string,
): Promise<string[]> {
  const txn = await loadTransaction(tenantId, transactionId);
  try {
    return await abdmProvider().suggestAbhaAddress({
      txnId: txn.txnId ?? '',
      hipId: await hipIdFor(tenantId, txn.branchId),
    });
  } catch (err) {
    throw toAppError(err);
  }
}

export async function createAbhaAddress(
  tenantId: string,
  input: { transactionId: string; abhaAddress: string },
  actorUserId?: string,
): Promise<{ transactionId: string; abhaAddress: string }> {
  const txn = await loadTransaction(tenantId, input.transactionId);
  try {
    const result = await abdmProvider().createAbhaAddress({
      txnId: txn.txnId ?? '',
      abhaAddress: input.abhaAddress,
      hipId: await hipIdFor(tenantId, txn.branchId),
    });
    await updateTransaction(tenantId, txn.id, {
      abhaAddress: result.abhaAddress,
      linkingTokenEnc: encryptLinkingToken(result.tokens) ?? txn.linkingTokenEnc,
    });
    await writeAudit({
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'abdm.abha_address.created',
      resourceType: 'abdm_transaction',
      resourceId: txn.id,
      severity: 'notice',
      metadata: { abhaAddress: result.abhaAddress },
    });
    return { transactionId: txn.id, abhaAddress: result.abhaAddress };
  } catch (err) {
    throw toAppError(err);
  }
}

/**
 * The ABHA card, streamed straight through.
 *
 * Never persisted: it is a rendering of data we already hold, it carries the patient's photo,
 * and a copy on our disk is one more place a health identity can leak from.
 */
export async function downloadAbhaCard(
  tenantId: string,
  transactionId: string,
): Promise<{ contentType: string; data: Buffer }> {
  const txn = await loadTransaction(tenantId, transactionId);
  try {
    return await abdmProvider().getAbhaCard({
      xToken: profileToken(txn),
      hipId: await hipIdFor(tenantId, txn.branchId),
      // An address-verified holder's card is served by the PHR family and only to its own token.
      family: txn.flow.startsWith('login_abha_address') ? 'phr' : 'profile',
    });
  } catch (err) {
    throw toAppError(err);
  }
}

/**
 * Amends the patient's profile AT ABDM, on a completed verification (`PATCH /v3/profile/account`).
 *
 * This is the only ABDM call in M1 that **writes to the national register** rather than reading
 * from it, which is why it carries its own permission and its own audit action. Three consequences
 * follow from that and are deliberate:
 *
 * - It needs the holder's own `X-token`, so it only works inside a verification the patient just
 *   authenticated — a hospital cannot amend an ABHA it has not been shown consent for.
 * - The stored profile is refreshed from ABDM's answer, not from what we asked for, so our copy
 *   never claims a change the register did not accept.
 * - It does **not** touch the patient's chart here. Correcting the national record and correcting
 *   the hospital's record are separate acts; conflating them would let one screen silently rewrite
 *   two systems.
 */
export async function updateAbhaProfile(
  tenantId: string,
  input: { transactionId: string; patch: AbdmProfilePatch },
  actorUserId?: string,
): Promise<VerificationResult> {
  const txn = await loadTransaction(tenantId, input.transactionId);
  if (Object.values(input.patch).every((v) => v === undefined)) {
    throw new AppError(422, 'ABDM_NOTHING_TO_UPDATE', 'No changes were supplied');
  }

  try {
    const profile = await abdmProvider().updateProfile({
      xToken: profileToken(txn),
      patch: input.patch,
      hipId: await hipIdFor(tenantId, txn.branchId),
    });

    const updated = await updateTransaction(tenantId, txn.id, {
      profile: scrubAadhaar(profile as unknown as Record<string, unknown>),
      abhaNumber: profile.abhaNumber ?? txn.abhaNumber,
      abhaAddress: profile.abhaAddress ?? txn.abhaAddress,
    } as Partial<AbdmTransaction>);

    await writeAudit({
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'abdm.profile.updated',
      resourceType: 'abdm_transaction',
      resourceId: txn.id,
      severity: 'notice',
      // WHICH fields changed, never their values — this is a patient's national identity record.
      metadata: {
        fields: Object.keys(input.patch).filter(
          (k) => input.patch[k as keyof AbdmProfilePatch] !== undefined,
        ),
      },
    });

    return {
      transactionId: updated.id,
      state: updated.state,
      prefill: {
        ...toPrefill(profile),
        abhaNumber: updated.abhaNumber ?? undefined,
        abhaAddress: updated.abhaAddress ?? undefined,
      },
      match: await matchPatient(tenantId, profile),
    };
  } catch (err) {
    throw toAppError(err);
  }
}

// ---------------------------------------------------------------------------------------------
// Flow 3 — verify an existing ABHA (number / address / mobile / Aadhaar)
// ---------------------------------------------------------------------------------------------

export type VerifyIdentifierType = 'abha_number' | 'abha_address' | 'mobile' | 'aadhaar';

/**
 * How each identifier is verified, taken from the official V3 collection.
 *
 * Two details are not guessable and were wrong before the collection was reconciled: the scope is
 * always a **pair** (`abha-login` plus the verification method), and an ABHA **address** is not a
 * profile login at all — it goes through the separate PHR web-login family, which is what
 * `family` selects.
 */
/** Which system delivers the OTP: UIDAI (`aadhaar`) or the ABHA-linked mobile (`abdm`). */
export type VerifyOtpSystem = 'aadhaar' | 'abdm';

const HINT_BY_TYPE: Record<
  VerifyIdentifierType,
  {
    hint: string;
    scope: string;
    family: 'profile' | 'phr';
    flow: string;
    /** The OTP systems this identifier accepts. The first is the default. */
    otpSystems: readonly [VerifyOtpSystem, ...VerifyOtpSystem[]];
  }
> = {
  /**
   * An ABHA number takes EITHER OTP system, and NHA requires both to be demonstrated:
   * `VRFY_ABHA_101` is the Aadhaar-OTP route and `VRFY_ABHA_201` the ABHA-linked-mobile one.
   * Wiring only the mobile route leaves a mandatory case with no way to run it at all.
   */
  abha_number: {
    hint: LOGIN_HINTS.abhaNumber,
    scope: ABDM_SCOPES.abhaLogin,
    family: 'profile',
    flow: 'login_abha_number',
    otpSystems: [OTP_SYSTEMS.abdm, OTP_SYSTEMS.aadhaar],
  },
  /** Same pair, on the PHR family: `VRFY_ABHA_102` (Aadhaar OTP) and `VRFY_ABHA_202` (mobile). */
  abha_address: {
    hint: LOGIN_HINTS.abhaAddress,
    scope: ABDM_SCOPES.abhaAddressLogin,
    family: 'phr',
    flow: 'login_abha_address',
    otpSystems: [OTP_SYSTEMS.abdm, OTP_SYSTEMS.aadhaar],
  },
  mobile: {
    hint: LOGIN_HINTS.mobile,
    scope: ABDM_SCOPES.abhaLogin,
    family: 'profile',
    flow: 'login_mobile',
    otpSystems: [OTP_SYSTEMS.abdm],
  },
  // Aadhaar-keyed lookup goes to UIDAI for the OTP, which is why it needs consent like enrolment.
  aadhaar: {
    hint: LOGIN_HINTS.aadhaar,
    scope: ABDM_SCOPES.abhaLogin,
    family: 'profile',
    flow: 'login_aadhaar',
    otpSystems: [OTP_SYSTEMS.aadhaar],
  },
};

/** The verify-half scope that pairs with an OTP system. NHA rejects a single-element array. */
function verifyScopeFor(otpSystem: VerifyOtpSystem): string {
  return otpSystem === OTP_SYSTEMS.aadhaar ? ABDM_SCOPES.aadhaarVerify : ABDM_SCOPES.mobileVerify;
}

/**
 * The OTP system is carried on the transaction's `flow`, as a suffix on the non-default route.
 *
 * `login_abha_number` still means what it always meant. `login_abha_number_aadhaar` is the same
 * identifier verified through UIDAI instead — and the distinction has to survive to the verify
 * call, because the scope pair sent there must match the one the OTP was requested with.
 */
function flowFor(type: VerifyIdentifierType, otpSystem: VerifyOtpSystem): string {
  const base = HINT_BY_TYPE[type].flow;
  return otpSystem === HINT_BY_TYPE[type].otpSystems[0] ? base : `${base}_${otpSystem}`;
}

function otpSystemOfFlow(flow: string, type: VerifyIdentifierType): VerifyOtpSystem {
  return flow.endsWith('_aadhaar') && type !== 'aadhaar'
    ? OTP_SYSTEMS.aadhaar
    : HINT_BY_TYPE[type].otpSystems[0];
}

export async function startVerification(
  tenantId: string,
  input: {
    identifierType: VerifyIdentifierType;
    identifier: string;
    consentGiven: boolean;
    branchId?: string | null;
    /** Defaults to the identifier's first supported system; see `HINT_BY_TYPE`. */
    otpSystem?: VerifyOtpSystem;
  },
  actorUserId?: string,
): Promise<{
  transactionId: string;
  mobileHint?: string;
  devOtp?: string;
  authMethods?: string[];
}> {
  if (!input.consentGiven) {
    throw new AppError(
      422,
      'ABDM_CONSENT_REQUIRED',
      "Record the patient's consent before sending an OTP",
    );
  }
  const config = HINT_BY_TYPE[input.identifierType];
  const otpSystem = input.otpSystem ?? config.otpSystems[0];
  if (!config.otpSystems.includes(otpSystem)) {
    throw new AppError(
      422,
      'ABDM_OTP_SYSTEM_UNSUPPORTED',
      `This identifier cannot be verified with an ${otpSystem === 'aadhaar' ? 'Aadhaar' : 'ABHA-linked mobile'} OTP`,
    );
  }
  const identifier =
    input.identifierType === 'abha_address'
      ? input.identifier.trim()
      : input.identifier.replace(/\D/g, '');
  if (!identifier)
    throw new AppError(422, 'ABDM_INVALID_IDENTIFIER', 'Enter the identifier to verify');
  // The shape of each identifier, checked HERE and not only in the form.
  //
  // NHA tests the refusal, not the acceptance: `VRFY_ABHA_301` is "enter an invalid mobile number,
  // see 'Please enter a valid mobile number'", and `VRFY_ABHA_401` the same for an Aadhaar. A
  // malformed identifier that reaches the registry comes back as a generic upstream failure, which
  // is not the message the case asks for and is a wasted round trip against a national service.
  if (input.identifierType === 'aadhaar' && !/^\d{12}$/.test(identifier)) {
    throw new AppError(422, 'ABDM_INVALID_AADHAAR', 'Enter a 12-digit Aadhaar number');
  }
  if (input.identifierType === 'mobile' && !/^[6-9]\d{9}$/.test(identifier)) {
    throw new AppError(422, 'ABDM_INVALID_MOBILE', 'Please enter a valid mobile number');
  }
  if (input.identifierType === 'abha_number' && !/^\d{14}$/.test(identifier)) {
    throw new AppError(422, 'ABDM_INVALID_ABHA_NUMBER', 'Enter a 14-digit ABHA number');
  }

  const provider = abdmProvider();
  const hipId = await hipIdFor(tenantId, input.branchId);
  const hint =
    input.identifierType === 'aadhaar'
      ? maskAadhaar(identifier)
      : input.identifierType === 'mobile'
        ? maskMobile(identifier)
        : identifier;

  const txn = await createTransaction({
    tenantId,
    branchId: input.branchId,
    flow: flowFor(input.identifierType, otpSystem),
    identifierHint: hint,
    consentAt: new Date(),
    actorUserId,
  });

  try {
    const encrypted = await encryptForAbdm(provider, identifier);

    // An ABHA ADDRESS is asked about before it is texted (NHA's M1 workbook lists
    // `phr/web/login/abha/search` as the first call of VRFY_ABHA_102 and _202). The registry
    // answers with the methods that address actually supports, so an address it does not hold
    // fails here — at the desk, before the operator has promised the patient a message — and an
    // Aadhaar OTP is never requested for a holder who has no Aadhaar-linked mobile.
    let authMethods: string[] | undefined;
    if (config.family === 'phr') {
      const found = await provider.phrSearchAuthMethods({ encryptedAbhaAddress: encrypted, hipId });
      authMethods = found.authMethods;
      // Probed against the sandbox on 03/09/2026: an address nobody holds comes back as
      // `400 ABDM-9999 Invalid ABHA Address`, which `toAppError` already surfaces with NHA's own
      // wording. This branch is the other shape — a 200 carrying nothing — which the registry has
      // not been seen to send but which would otherwise fall through to an OTP request for an
      // account that does not exist.
      if (found.authMethods.length === 0) {
        throw new AppError(
          404,
          'ABDM_ABHA_ADDRESS_NOT_FOUND',
          'No ABHA was found for that ABHA address',
        );
      }
      const wanted = otpSystem === OTP_SYSTEMS.aadhaar ? 'AADHAAR' : 'MOBILE';
      if (!found.authMethods.some((m) => m.includes(wanted))) {
        throw new AppError(
          422,
          'ABDM_OTP_SYSTEM_UNSUPPORTED',
          `This ABHA address cannot be verified with an ${wanted === 'AADHAAR' ? 'Aadhaar' : 'ABHA-linked mobile'} OTP`,
        );
      }
    }

    const otp = await provider.loginRequestOtp({
      scope: config.scope,
      loginHint: config.hint,
      encryptedLoginId: encrypted,
      otpSystem,
      family: config.family,
      hipId,
    });
    await updateTransaction(tenantId, txn.id, { txnId: otp.txnId });
    await writeAudit({
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'abdm.verify.otp.requested',
      resourceType: 'abdm_transaction',
      resourceId: txn.id,
      severity: 'notice',
      metadata: { identifierType: input.identifierType, identifierHint: hint, otpSystem },
    });
    return { transactionId: txn.id, mobileHint: otp.mobileHint, devOtp: otp.devOtp, authMethods };
  } catch (err) {
    await updateTransaction(tenantId, txn.id, { state: 'failed', failureCode: errCode(err) });
    throw toAppError(err);
  }
}

export async function verifyIdentifierOtp(
  tenantId: string,
  input: { transactionId: string; otp: string },
  actorUserId?: string,
): Promise<VerificationResult> {
  const txn = await loadTransaction(tenantId, input.transactionId);
  const provider = abdmProvider();
  const hipId = await hipIdFor(tenantId, txn.branchId);
  const type = flowToType(txn.flow);
  const config = HINT_BY_TYPE[type];
  const otpSystem = otpSystemOfFlow(txn.flow, type);

  try {
    const encryptedOtp = await encryptForAbdm(provider, input.otp);
    const result = await provider.loginVerify({
      txnId: txn.txnId ?? '',
      encryptedOtp,
      // The same pair the OTP was requested with — NHA rejects a single-element scope, and it
      // rejects a pair whose verify half does not match the system that sent the OTP.
      scope: [config.scope, verifyScopeFor(otpSystem)],
      family: config.family,
      hipId,
    });

    // Several ABHA accounts on one identifier: the operator picks before anything is prefilled.
    //
    // The list itself carries real demographics — ABHA number, ABHA address, gender, date of
    // birth — and they used to be handed to the browser and then forgotten (ADR-130). The
    // follow-up call that resolves the chosen account returns a token and often nothing else, so
    // whatever the list said was the only description of that person we would ever have. It is
    // stored on the transaction now, keyed by ABHA number, and merged in when one is picked.
    if (!result.profile && result.accounts.length > 0) {
      await updateTransaction(tenantId, txn.id, {
        state: 'verified',
        linkingTokenEnc: encryptLinkingToken(result.tokens),
        xTokenEnc: encryptToken(result.tokens.xToken, 'profile token'),
        profile: scrubAadhaar({ candidateAccounts: result.accounts } as unknown as Record<
          string,
          unknown
        >),
      } as Partial<AbdmTransaction>);
      return {
        transactionId: txn.id,
        state: 'verified',
        prefill: {},
        match: { outcome: 'new', candidates: [] },
        accounts: result.accounts,
      };
    }
    // The PHR web-login family verifies and returns a token — the demographics are a second call,
    // to that family's own profile path. Treating the empty verify response as 'no such ABHA'
    // would fail every ABHA-address verification (VRFY_ABHA_102, VRFY_ABHA_202) at the last step.
    let profile = result.profile;
    if (!profile && config.family === 'phr' && result.tokens.xToken) {
      profile = await provider.getProfile({ xToken: result.tokens.xToken, hipId, family: 'phr' });
    }

    // No accounts AND no profile is not an upstream failure — it is a valid answer meaning "no
    // ABHA is registered against this identifier" (`VRFY_ABHA_302`, `_403`). A 502 said the wrong
    // thing twice over: it blamed ABDM for working correctly, and it gave the operator no reason
    // to move to the create-ABHA flow, which is what the workbook says must stay open.
    if (!profile) {
      const kind =
        type === 'mobile'
          ? 'this mobile number. Please use the ABHA-linked mobile number'
          : type === 'aadhaar'
            ? 'this Aadhaar number'
            : 'this identifier';
      throw new AppError(
        404,
        'ABDM_NO_ABHA_FOUND',
        `No ABHA number is linked to ${kind}. An ABHA can be created instead.`,
      );
    }
    return await completeWithProfile(tenantId, txn, profile, result.tokens, { actorUserId });
  } catch (err) {
    await updateTransaction(tenantId, txn.id, { state: 'failed', failureCode: errCode(err) });
    throw toAppError(err);
  }
}

function flowToType(flow: string): VerifyIdentifierType {
  // `login_aadhaar` is checked FIRST and on the whole string: `login_abha_number_aadhaar` is an
  // ABHA number verified by Aadhaar OTP, not an Aadhaar-keyed lookup, and a `startsWith` here
  // would silently swap one mandatory case for another.
  if (flow === 'login_aadhaar') return 'aadhaar';
  if (flow.startsWith('login_abha_address')) return 'abha_address';
  if (flow.startsWith('login_mobile')) return 'mobile';
  return 'abha_number';
}

/** Chooses one ABHA when the identifier resolved to several. */
export async function selectAbhaAccount(
  tenantId: string,
  input: { transactionId: string; abhaNumber: string },
  actorUserId?: string,
): Promise<VerificationResult> {
  const txn = await loadTransaction(tenantId, input.transactionId);
  try {
    const result = await abdmProvider().loginVerifyUser({
      txnId: txn.txnId ?? '',
      abhaNumber: input.abhaNumber,
      token: profileToken(txn),
      hipId: await hipIdFor(tenantId, txn.branchId),
    });
    // What the account list said about the ABHA the operator chose. `loginVerifyUser` returns a
    // token and, on the sandbox, an almost empty profile — so without this the desk would be
    // handed a blank form for a patient ABDM had just described (ADR-130).
    const chosen = chosenAccountProfile(txn, input.abhaNumber);
    return await completeWithProfile(
      tenantId,
      { ...txn, profile: mergeProfiles(chosen, storedProfile(txn) ?? {}) } as AbdmTransaction,
      mergeProfiles(chosen, result.profile),
      result.tokens,
      { actorUserId },
    );
  } catch (err) {
    throw toAppError(err);
  }
}

/**
 * The demographics the account list gave for one ABHA number.
 *
 * The list's `name` is a single string; ABDM does not split it, and neither do we — guessing a
 * surname from a space is how "Patel Jaivik Kamleshkumar" becomes the wrong two fields. It goes in
 * as the first name and the operator adjusts, which is a correction rather than an invention.
 */
function chosenAccountProfile(txn: AbdmTransaction, abhaNumber: string): AbdmProfile {
  const stored = (
    txn as { profile?: { candidateAccounts?: Array<Record<string, string | undefined>> } }
  ).profile;
  const found = (stored?.candidateAccounts ?? []).find((a) => a.abhaNumber === abhaNumber);
  if (!found) return { abhaNumber };
  return {
    abhaNumber: found.abhaNumber,
    abhaAddress: found.abhaAddress,
    firstName: found.name,
    gender: found.gender,
    dateOfBirth: found.dateOfBirth,
  };
}

// ---------------------------------------------------------------------------------------------
// Flow 2 — Scan and Share (the preferred path: no OTP at all)
// ---------------------------------------------------------------------------------------------

/**
 * Receives a profile pushed by a patient's PHR app after they scanned the hospital's QR.
 *
 * Unauthenticated by necessity — the caller is ABDM, not a signed-in user — so it is held to the
 * public-endpoint rules (ADR-056): the tenant is resolved **server-side from the HFR facility id**
 * against `abdm_facility_config`, never from anything else in the payload; the same response is
 * returned for an unknown, disabled or retired facility so the endpoint cannot be used to
 * enumerate hospitals; it writes no clinical row; and it is audited against the tenant with no
 * actor. What it creates is a pending transaction for a human at the desk to act on.
 */
export async function handleProfileShare(input: {
  hipId: string;
  profile: AbdmProfile;
  linkingToken?: string;
  /** `metaData.context` from the gateway, echoed back on `on-share`. */
  context?: string;
  /** The inbound `REQUEST-ID`, which `on-share` must quote so the gateway can correlate. */
  requestId?: string;
}): Promise<{ accepted: boolean }> {
  const config = await findFacilityByHipId(input.hipId);
  // Unknown facility, or Scan-and-Share not switched on: accept and drop. Any other answer tells
  // an unauthenticated caller which facility ids are real.
  if (!config || !config.scanShareEnabled) {
    logger.warn(
      { hipId: input.hipId },
      'Profile share received for an unknown or disabled facility',
    );
    return { accepted: true };
  }

  const tenantId = config.tenantId;
  const txn = await createTransaction({
    tenantId,
    branchId: config.branchId,
    flow: 'scan_share',
    // The ABHA address only. `identifier_hint` is for a *masked inbound identifier*, and an ABHA
    // number already has its own column — writing one here also trips the Aadhaar-shape CHECK
    // constraint, because `11-2222-3333-4444` is 4-4-4 digits like an Aadhaar in grouped form.
    identifierHint: input.profile.abhaAddress ?? undefined,
    // The patient consented in their own PHR app by scanning; that consent is ABDM's record.
    consentAt: new Date(),
  });

  const match = await matchPatient(tenantId, input.profile);
  await updateTransaction(tenantId, txn.id, {
    state: 'verified',
    abhaNumber: input.profile.abhaNumber ?? null,
    abhaAddress: input.profile.abhaAddress ?? null,
    profile: scrubAadhaar(input.profile as unknown as Record<string, unknown>),
    linkingTokenEnc: encryptLinkingToken({ linkingToken: input.linkingToken }),
    matchOutcome: match.outcome,
  } as Partial<AbdmTransaction>);

  await writeAudit({
    tenantId,
    actorUserId: null,
    action: 'abdm.scan_share.received',
    resourceType: 'abdm_transaction',
    resourceId: txn.id,
    severity: 'notice',
    metadata: { hipId: input.hipId, matchOutcome: match.outcome },
  });

  // The half a one-way implementation silently omits: without this the patient's app shows
  // nothing back and the exchange is incomplete. Best-effort — the profile is already safely at
  // the desk, so a failure here must not undo it or fail the inbound request.
  void sendOnShare({
    tenantId,
    abhaAddress: input.profile.abhaAddress,
    context: input.context,
    requestId: input.requestId,
    tokenNumber: await nextTokenNumber(tenantId),
  }).catch((err) =>
    logger.error({ err, hipId: input.hipId }, 'ABDM on-share acknowledgement failed'),
  );

  return { accepted: true };
}

/**
 * The number the patient sees on their phone and hears called at the desk.
 *
 * Today's count of shares for this hospital, plus one — a queue position, which is what the field
 * means to the patient. It is deliberately per tenant and per day: a global counter would leak how
 * busy other hospitals are, and a never-resetting one would be meaningless to read out.
 */
async function nextTokenNumber(tenantId: string): Promise<number> {
  const rows = await runWithTenant(tenantId, async (tx) =>
    tx
      .select({ c: sql<number>`count(*)::int` })
      .from(abdmTransactions)
      .where(
        and(
          eq(abdmTransactions.tenantId, tenantId),
          eq(abdmTransactions.flow, 'scan_share'),
          sql`${abdmTransactions.createdAt} >= date_trunc('day', now())`,
        ),
      ),
  );
  return Number(rows[0]?.c ?? 0);
}

/**
 * Acknowledges a share back to the gateway (`patient-share/v3/on-share`).
 *
 * Quotes the inbound `REQUEST-ID` so NHA can correlate the exchange, and echoes the context the
 * share arrived with. `expiry` is the token's life in seconds, matching the collection's example.
 */
async function sendOnShare(input: {
  tenantId: string;
  abhaAddress?: string;
  context?: string;
  requestId?: string;
  tokenNumber: number;
}): Promise<void> {
  if (env.ABDM_PROVIDER !== 'gateway') {
    logger.info(
      { tokenNumber: input.tokenNumber },
      'ABDM on-share skipped — not running against the gateway',
    );
    return;
  }
  const { getAccessToken, baseHeaders } = await import('./abdm.session');
  const { GATEWAY_ON_SHARE_PATH } = await import('./abdm.constants');
  const headers = baseHeaders();
  headers.Authorization = `Bearer ${await getAccessToken()}`;

  const res = await fetch(`${env.ABDM_GATEWAY_BASE_URL}${GATEWAY_ON_SHARE_PATH}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      acknowledgement: {
        status: 'SUCCESS',
        abhaAddress: input.abhaAddress,
        profile: {
          context: input.context ?? '1',
          tokenNumber: String(input.tokenNumber),
          expiry: '1800',
        },
      },
      response: { requestId: input.requestId },
    }),
  });
  if (!res.ok) {
    throw new AbdmGatewayError(
      res.status,
      'ABDM_ON_SHARE_FAILED',
      `on-share rejected (${res.status})`,
    );
  }
  logger.info({ tokenNumber: input.tokenNumber }, 'ABDM on-share acknowledged');
}

async function findFacilityByHipId(hipId: string) {
  // Deliberately outside a tenant context: this is the ONE lookup that resolves which tenant a
  // request belongs to, so it cannot itself be tenant-scoped. It reads a configuration table
  // only — no clinical data is reachable from here.
  const { db } = await import('../../db/client');
  const rows = await db
    .select()
    .from(abdmFacilityConfig)
    .where(eq(abdmFacilityConfig.hipId, hipId))
    .limit(1);
  return rows[0] ?? null;
}

/** Scan-and-Share arrivals waiting at the desk, newest first. Drives the registration screen. */
export async function listPendingShares(tenantId: string, limit = 10) {
  const rows = await runWithTenant(tenantId, async (tx) =>
    tx
      .select()
      .from(abdmTransactions)
      .where(
        and(
          eq(abdmTransactions.tenantId, tenantId),
          eq(abdmTransactions.flow, 'scan_share'),
          eq(abdmTransactions.state, 'verified'),
          isNull(abdmTransactions.consumedAt),
        ),
      )
      .orderBy(desc(abdmTransactions.createdAt))
      .limit(limit),
  );
  return rows
    .filter((r) => r.expiresAt.getTime() > Date.now())
    .map((r) => ({
      transactionId: r.id,
      abhaNumber: r.abhaNumber,
      abhaAddress: r.abhaAddress,
      // The identifiers come from their own columns, not from the stored profile blob. The blob
      // passes through the Aadhaar scrubber on the way in, and an ABHA number is one character of
      // formatting away from looking like an Aadhaar — so the columns are both the authoritative
      // copy and the one that cannot be mangled by a defensive measure aimed at something else.
      prefill: {
        ...toPrefill((r.profile ?? {}) as AbdmProfile),
        abhaNumber: r.abhaNumber ?? undefined,
        abhaAddress: r.abhaAddress ?? undefined,
      },
      matchOutcome: r.matchOutcome,
      receivedAt: r.createdAt.toISOString(),
    }));
}

/** The stored result of a transaction, for a screen that reloads mid-flow. */
export async function getVerification(
  tenantId: string,
  transactionId: string,
): Promise<VerificationResult> {
  const txn = await loadTransaction(tenantId, transactionId);
  const profile = (txn.profile ?? {}) as AbdmProfile;
  return {
    transactionId: txn.id,
    state: txn.state,
    // Identifiers from their own columns — see `listPendingShares` for why.
    prefill: {
      ...toPrefill(profile),
      abhaNumber: txn.abhaNumber ?? undefined,
      abhaAddress: txn.abhaAddress ?? undefined,
    },
    match: txn.profile ? await matchPatient(tenantId, profile) : { outcome: 'new', candidates: [] },
  };
}

// ---------------------------------------------------------------------------------------------
// Linking a verified ABHA onto a chart
// ---------------------------------------------------------------------------------------------

/**
 * Writes the verified ABHA identifiers onto a patient record and closes the transaction.
 *
 * This is the only path that may set `abhaVerifiedAt`. A hand-typed ABHA number stays unverified
 * for ever, which is the distinction the column exists to make.
 */
export async function linkToPatient(
  tenantId: string,
  input: { transactionId: string; patientId: string },
  actorUserId?: string,
): Promise<Patient> {
  const txn = await loadTransaction(tenantId, input.transactionId);
  if (!txn.abhaNumber && !txn.abhaAddress) {
    throw new AppError(422, 'ABDM_NOT_VERIFIED', 'This verification has not produced an ABHA yet');
  }

  const patient = await runWithTenant(tenantId, async (tx) => {
    // An ABHA identifies one person: refuse to attach it to a second chart in the same hospital.
    const clash = await tx
      .select({ id: patients.id, uhid: patients.uhid })
      .from(patients)
      .where(
        and(
          eq(patients.tenantId, tenantId),
          sql`regexp_replace(coalesce(${patients.abhaNumber}, ''), '[^0-9]', '', 'g') = ${(txn.abhaNumber ?? '').replace(/\D/g, '')}`,
          sql`${patients.id} <> ${input.patientId}`,
        ),
      )
      .limit(1);
    if (clash[0]) {
      throw new AppError(
        409,
        'ABHA_ALREADY_LINKED',
        `This ABHA is already linked to ${clash[0].uhid}`,
      );
    }

    const rows = await tx
      .update(patients)
      .set({
        abhaNumber: txn.abhaNumber ?? undefined,
        abhaAddress: txn.abhaAddress ?? undefined,
        abhaVerifiedAt: new Date(),
        abhaSource:
          txn.flow === 'scan_share'
            ? 'scan_share'
            : txn.flow.startsWith('enrol')
              ? 'aadhaar_otp'
              : 'abha_login',
        abhaLinkingTokenEnc: txn.linkingTokenEnc ?? undefined,
        abhaConsentAt: txn.consentAt ?? undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(patients.tenantId, tenantId), eq(patients.id, input.patientId)))
      .returning();
    if (!rows[0]) throw Errors.notFound('Patient not found');
    return rows[0];
  });

  await updateTransaction(tenantId, txn.id, {
    state: 'completed',
    patientId: input.patientId,
    consumedAt: new Date(),
  });
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'abdm.abha.linked',
    resourceType: 'patient',
    resourceId: input.patientId,
    severity: 'notice',
    metadata: {
      transactionId: txn.id,
      flow: txn.flow,
      abhaNumber: txn.abhaNumber,
      matchOutcome: txn.matchOutcome,
    },
  });
  return patient;
}

/** Marks a transaction finished without linking — the operator fell back to the manual form. */
export async function dismissTransaction(
  tenantId: string,
  transactionId: string,
  actorUserId?: string,
): Promise<void> {
  const txn = await loadTransaction(tenantId, transactionId);
  await updateTransaction(tenantId, txn.id, { state: 'consumed', consumedAt: new Date() });
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'abdm.verification.dismissed',
    resourceType: 'abdm_transaction',
    resourceId: txn.id,
    metadata: { flow: txn.flow },
  });
}

/** Whether ABDM is usable for this tenant right now — drives what the registration screen offers. */
export async function getCapabilities(tenantId: string, branchId?: string | null) {
  const config = await getFacilityConfig(tenantId, branchId);
  return {
    provider: env.ABDM_PROVIDER,
    /** Aadhaar/mobile flows need no facility id; only Scan-and-Share does. */
    creationEnabled: true,
    verificationEnabled: true,
    scanShareEnabled: Boolean(config?.scanShareEnabled && config?.qrContent),
    facilityConfigured: Boolean(config?.hipId),
    facilityName: config?.facilityName ?? null,
    qrContent: config?.scanShareEnabled ? (config?.qrContent ?? null) : null,
    encryptionConfigured: isEncryptionConfigured(),
    consentVersion: env.ABDM_CONSENT_VERSION,
  };
}
