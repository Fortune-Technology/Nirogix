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
