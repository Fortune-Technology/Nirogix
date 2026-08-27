import { z } from '../../openapi/registry';

/**
 * Request/response contracts for ABDM Milestone 1 (ADR-084).
 *
 * Two things are deliberately absent from every response schema below: the Aadhaar number and
 * any ABDM token. The Aadhaar exists only as an inbound field on two requests and is never
 * echoed; the tokens stay server-side. A browser receives demographics and a transaction id.
 */

const aadhaar = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => /^\d{12}$/.test(v), 'Enter a 12-digit Aadhaar number');

const otp = z.string().regex(/^\d{4,8}$/, 'Enter the OTP exactly as received');

/**
 * An Indian mobile number, normalised to the bare 10 digits ABDM expects.
 *
 * The Portal's `PhoneField` produces the canonical `+91XXXXXXXXXX`, which is right for storage and
 * for every other endpoint — so a schema here that demanded exactly ten digits rejected a perfectly
 * valid number at our own boundary, with "Invalid", after the patient had already received an OTP.
 * Found live against the sandbox on 25/08/2026.
 *
 * The boundary normalises rather than insists: `+91…`, `91…`, `0…` and the bare form all mean the
 * same number, and it is not the caller's job to know which spelling this particular downstream
 * wants. The `[6-9]` first digit is the real validity rule for an Indian mobile.
 */
const indianMobile = z
  .string()
  .transform((v) => {
    const digits = v.replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits;
  })
  .refine((v) => /^[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit Indian mobile number');

/**
 * Consent is a required `true`, not a boolean with a default.
 *
 * An Aadhaar OTP reaches a real person's phone, so the request has to carry an explicit
 * assertion that the patient agreed — a field that can be omitted would let the UI forget it
 * (UIDAI norms, and the consent-artifact expectation that returns for M2/M3).
 */
const consentGiven = z.literal(true, {
  errorMap: () => ({ message: "Record the patient's consent before sending an OTP" }),
});

export const StartAadhaarBody = z.object({
  aadhaar,
  consentGiven,
  branchId: z.string().uuid().optional(),
});

export const VerifyAadhaarOtpBody = z.object({
  transactionId: z.string().uuid(),
  otp,
  /** The mobile the patient wants on the chart, when it differs from the Aadhaar-linked one. */
  mobile: indianMobile.optional(),
});

export const RequestMobileOtpBody = z.object({
  transactionId: z.string().uuid(),
  mobile: indianMobile,
});

export const VerifyOtpBody = z.object({
  transactionId: z.string().uuid(),
  otp,
});

export const StartVerificationBody = z.object({
  identifierType: z.enum(['abha_number', 'abha_address', 'mobile', 'aadhaar']),
  identifier: z.string().min(3).max(80),
  consentGiven,
  branchId: z.string().uuid().optional(),
});

export const SelectAccountBody = z.object({
  transactionId: z.string().uuid(),
  abhaNumber: z.string().min(10).max(20),
});

export const CreateAbhaAddressBody = z.object({
  transactionId: z.string().uuid(),
  abhaAddress: z
    .string()
    .min(4)
    .max(80)
    .regex(/^[a-zA-Z0-9._@-]+$/, 'An ABHA address may contain letters, numbers, dot, underscore and hyphen'),
});

/**
 * The fields a hospital may correct on the patient's ABDM profile.
 *
 * Every one optional, at least one required (checked in the service): a PATCH that changes nothing
 * is a mistake worth naming rather than a no-op worth accepting. `profilePhoto` is base64 and
 * capped — the endpoint writes to a national register, and an unbounded string field on that path
 * is not something to leave open.
 */
export const UpdateAbhaProfileBody = z.object({
  transactionId: z.string().uuid(),
  profilePhoto: z.string().max(2_000_000).optional(),
  firstName: z.string().max(100).optional(),
  middleName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  gender: z.enum(['M', 'F', 'O']).optional(),
  /** `DD-MM-YYYY`, the form ABDM's own examples use. */
  dateOfBirth: z
    .string()
    .regex(/^\d{2}-\d{2}-\d{4}$/, 'Use DD-MM-YYYY')
    .optional(),
  address: z.string().max(300).optional(),
  pincode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code').optional(),
});

export const LinkPatientBody = z.object({
  transactionId: z.string().uuid(),
  patientId: z.string().uuid(),
});

export const FacilityConfigBody = z.object({
  hipId: z.string().min(3).max(64),
  facilityName: z.string().max(200).optional(),
  qrContent: z.string().max(4000).optional(),
  scanShareEnabled: z.boolean().optional(),
  branchId: z.string().uuid().optional(),
});

/**
 * The Scan-and-Share callback body, exactly as the V3 collection sends it.
 *
 * Nested, not flat: `metaData` carries the facility and the transaction context, and the patient
 * sits at `profile.patient`. The date of birth arrives as three separate fields — and partially
 * masked in the collection's own example (`"1*"`, `"19**"`), because a PHR app may share an
 * incomplete date. So none of it is required, and nothing here is trusted to identify a hospital:
 * the tenant is resolved from `metaData.hipId` server-side.
 *
 * `.passthrough()` on both objects because NHA sends fields we do not consume today, and silently
 * dropping them from a payload we did not design would discard information a later milestone needs.
 */
export const HipProfileShareBody = z
  .object({
    intent: z.string().optional(),
    metaData: z
      .object({
        hipId: z.string().optional(),
        context: z.string().optional(),
        hprId: z.string().optional(),
        latitude: z.string().optional(),
        longitude: z.string().optional(),
      })
      .passthrough(),
    profile: z.object({
      patient: z
        .object({
          abhaNumber: z.union([z.string(), z.number()]).optional(),
          abhaAddress: z.string().optional(),
          name: z.string().optional(),
          gender: z.string().optional(),
          dayOfBirth: z.string().optional(),
          monthOfBirth: z.string().optional(),
          yearOfBirth: z.string().optional(),
          address: z
            .object({
              line: z.string().nullable().optional(),
              district: z.string().nullable().optional(),
              state: z.string().nullable().optional(),
              pinCode: z.union([z.string(), z.number()]).nullable().optional(),
            })
            .passthrough()
            .optional(),
          phoneNumber: z.string().optional(),
        })
        .passthrough(),
    }),
  })
  .passthrough();

/**
 * The link token NHA delivers on our webhook after a demographic-auth request (ADR-089).
 *
 * `.passthrough()` because the callback carries a `response.requestId` and other correlation fields
 * we do not consume today; dropping them from a payload we did not design would discard information
 * a later milestone needs.
 */
export const OnGenerateTokenBody = z
  .object({
    abhaAddress: z.string().min(3).max(80),
    linkToken: z.string().min(20),
    response: z.object({ requestId: z.string() }).passthrough().optional(),
  })
  .passthrough();

/** ABDM confirming (or refusing) a care-context link. */
export const OnLinkCareContextBody = z
  .object({
    abhaAddress: z.string().min(3).max(80).optional(),
    status: z.string().optional(),
    error: z.object({ code: z.union([z.string(), z.number()]).optional(), message: z.string().optional() }).passthrough().optional(),
    response: z.object({ requestId: z.string() }).passthrough().optional(),
  })
  .passthrough();

/**
 * Discovery, as the gateway sends it (ADR-090).
 *
 * `verifiedIdentifiers` carry what ABDM proved; `unverifiedIdentifiers` carry what the patient
 * typed. Keeping them apart in the type is what stops the matcher treating a self-declared hospital
 * number as proof.
 */
const Identifier = z.object({ type: z.string(), value: z.union([z.string(), z.number()]) }).passthrough();

export const DiscoverBody = z
  .object({
    transactionId: z.string().optional(),
    requestId: z.string().optional(),
    patient: z
      .object({
        id: z.string().optional(),
        name: z.string().optional(),
        gender: z.string().optional(),
        yearOfBirth: z.union([z.string(), z.number()]).optional(),
        verifiedIdentifiers: z.array(Identifier).optional(),
        unverifiedIdentifiers: z.array(Identifier).optional(),
      })
      .passthrough(),
  })
  .passthrough();

export const LinkInitBody = z
  .object({
    transactionId: z.string(),
    requestId: z.string().optional(),
    patient: z
      .object({
        referenceNumber: z.string(),
        careContexts: z.array(z.object({ referenceNumber: z.string() }).passthrough()).min(1),
      })
      .passthrough(),
  })
  .passthrough();

export const LinkConfirmBody = z
  .object({
    requestId: z.string().optional(),
    confirmation: z.object({ linkRefNumber: z.string(), token: z.string().min(4).max(12) }).passthrough(),
  })
  .passthrough();

/**
 * A consented request for health records (ADR-091).
 *
 * `dataPushUrl` is accepted as any HTTPS URL by design: a HIU may nominate any endpoint, and the
 * security of the exchange comes from the payload being unreadable to anyone but them — not from
 * restricting where it goes. An allowlist here would break legitimate transfers.
 */
export const HealthInformationRequestBody = z
  .object({
    transactionId: z.string().min(1),
    requestId: z.string().optional(),
    hiRequest: z
      .object({
        consent: z.object({ id: z.string().min(1) }).passthrough(),
        dataPushUrl: z.string().url(),
        keyMaterial: z
          .object({
            dhPublicKey: z.object({ keyValue: z.string() }).passthrough().optional(),
            nonce: z.string().optional(),
          })
          .passthrough()
          .optional(),
        dateRange: z.object({ from: z.string().optional(), to: z.string().optional() }).passthrough().optional(),
        careContexts: z.array(z.object({ careContextReference: z.string() }).passthrough()).optional(),
      })
      .passthrough(),
  })
  .passthrough();

/**
 * Milestone 3 — asking for a patient's history from other hospitals (ADR-092).
 *
 * `providerId` is required and never inferred from the session: the doctor whose name and
 * registration number reach the patient's app must be a deliberate choice, not whoever happened to
 * be logged in. A nurse operating a doctor's screen must not have the doctor's identity attached to
 * a national consent request by accident.
 */
export const RequestHistoryBody = z.object({
  patientId: z.string().uuid(),
  providerId: z.string().uuid(),
  hiTypes: z.array(z.string().min(1)).max(7).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  dataEraseAt: z.string().datetime().optional(),
});

/** ABDM naming our consent request, asynchronously. */
export const HiuOnInitBody = z
  .object({
    consentRequest: z.object({ id: z.string().min(1) }).passthrough(),
    response: z.object({ requestId: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

/** One granted artefact, delivered after we asked to fetch it. */
export const HiuOnFetchBody = z
  .object({
    consent: z
      .object({
        status: z.string().optional(),
        consentDetail: z
          .object({
            consentId: z.string().min(1),
            consentManager: z.object({ id: z.string() }).passthrough().optional(),
            patient: z.object({ id: z.string() }).passthrough(),
            hip: z.object({ id: z.string().optional() }).passthrough().optional(),
            hiu: z.object({ id: z.string().optional() }).passthrough().optional(),
            purpose: z.object({ code: z.string().optional(), text: z.string().optional() }).passthrough().optional(),
            hiTypes: z.array(z.string()).optional(),
            careContexts: z.array(z.object({}).passthrough()).optional(),
            permission: z.object({}).passthrough().optional(),
            createdAt: z.string().optional(),
          })
          .passthrough(),
        signature: z.string().optional(),
      })
      .passthrough(),
    response: z.object({ requestId: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

/**
 * ABDM telling us a consent was revoked or expired.
 *
 * The most consequential inbound call in M3: it obliges us to destroy another hospital's records.
 * Deliberately permissive on shape and strict on the two fields that matter, because a parse failure
 * here would mean silently keeping data we promised to delete.
 */
export const HiuConsentNotifyBody = z
  .object({
    notification: z
      .object({
        status: z.string().min(1),
        consentId: z.string().optional(),
        consentDetail: z.object({ consentId: z.string().optional() }).passthrough().optional(),
        consentRequestId: z.string().optional(),
        consentArtefacts: z.array(z.object({ id: z.string() }).passthrough()).optional(),
      })
      .passthrough(),
  })
  .passthrough();

/**
 * A hospital pushing records we asked for (ADR-093).
 *
 * Deliberately permissive: this arrives from a stranger's system, and a schema strict enough to
 * reject an unfamiliar field would discard a patient's history over a formatting difference. The
 * integrity guarantee is the checksum after decryption, not this shape.
 */
export const HiuDataPushBody = z
  .object({
    transactionId: z.string().min(1),
    pageNumber: z.coerce.number().int().positive().optional(),
    pageCount: z.coerce.number().int().positive().optional(),
    entries: z.array(
      z
        .object({
          content: z.string().optional(),
          media: z.string().optional(),
          checksum: z.string().optional(),
          careContextReference: z.string().optional(),
          link: z.string().optional(),
        })
        .passthrough(),
    ),
    keyMaterial: z
      .object({
        dhPublicKey: z.object({ keyValue: z.string().optional() }).passthrough().optional(),
        nonce: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const TransactionParams = z.object({ transactionId: z.string().uuid() });
export const FacilityParams = z.object({ hipId: z.string().min(3).max(64) });

// --- Responses --------------------------------------------------------------------------------

export const AbhaPrefillSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    gender: z.string().nullable().optional(),
    dateOfBirth: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    addressLine: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    abhaNumber: z.string().optional(),
    abhaAddress: z.string().optional(),
  })
  .openapi('AbhaPrefill');

export const MatchCandidateSchema = z
  .object({
    id: z.string().uuid(),
    uhid: z.string(),
    firstName: z.string(),
    lastName: z.string().nullable(),
    gender: z.string().nullable(),
    dateOfBirth: z.string().nullable(),
    phone: z.string().nullable(),
    abhaNumber: z.string().nullable(),
    reason: z.enum(['exact_abha', 'demographic']),
  })
  .openapi('AbhaMatchCandidate');

export const VerificationResultSchema = z
  .object({
    transactionId: z.string().uuid(),
    state: z.string(),
    prefill: AbhaPrefillSchema,
    match: z.object({
      outcome: z.enum(['returning', 'ambiguous', 'new']),
      candidates: z.array(MatchCandidateSchema),
    }),
    isNewAbha: z.boolean().optional(),
    requiresMobileVerification: z.boolean().optional(),
    requiresAbhaAddress: z.boolean().optional(),
    accounts: z
      .array(z.object({ abhaNumber: z.string(), abhaAddress: z.string().optional(), name: z.string().optional() }))
      .optional(),
  })
  .openapi('AbhaVerificationResult');

export const OtpSentSchema = z
  .object({
    transactionId: z.string().uuid(),
    /** Masked destination, e.g. `XXXXXX7890`. */
    mobileHint: z.string().optional(),
    /** Sandbox/mock only — the OTP is returned in-band because no SMS is sent. */
    devOtp: z.string().optional(),
  })
  .openapi('AbdmOtpSent');

export const AbdmCapabilitiesSchema = z
  .object({
    provider: z.enum(['mock', 'gateway']),
    creationEnabled: z.boolean(),
    verificationEnabled: z.boolean(),
    scanShareEnabled: z.boolean(),
    facilityConfigured: z.boolean(),
    facilityName: z.string().nullable(),
    qrContent: z.string().nullable(),
    encryptionConfigured: z.boolean(),
    consentVersion: z.string(),
  })
  .openapi('AbdmCapabilities');

export const PendingShareSchema = z
  .object({
    transactionId: z.string().uuid(),
    abhaNumber: z.string().nullable(),
    abhaAddress: z.string().nullable(),
    prefill: AbhaPrefillSchema,
    matchOutcome: z.string().nullable(),
    receivedAt: z.string(),
  })
  .openapi('AbdmPendingShare');

export const PendingShareListSchema = z.array(PendingShareSchema).openapi('AbdmPendingShareList');
export const AbhaAddressSuggestionsSchema = z.object({ suggestions: z.array(z.string()) }).openapi('AbhaAddressSuggestions');

export const FacilityConfigSchema = z
  .object({
    id: z.string().uuid(),
    hipId: z.string(),
    facilityName: z.string().nullable(),
    qrContent: z.string().nullable(),
    scanShareEnabled: z.boolean(),
    branchId: z.string().uuid().nullable(),
  })
  .openapi('AbdmFacilityConfig');
