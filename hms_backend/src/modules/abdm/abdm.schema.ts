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

/**
 * The ABHA address policy, quoted from NHA's M1 workbook (`CRT_ABHA_112`).
 *
 * The workbook states the requirement twice over: the rules are *"to be set at the API level"* —
 * which is here, and is the only place that decides — and they must also be *"print[ed] beside the
 * field where ABHA Address is entered"*, which is the form's job.
 *
 * The form therefore carries its own copy of this sentence, because the backend and the Portal
 * share no contract package today (`hms_backend` depends only on `@hms/permissions`). That
 * duplication is a known cost: **this file is the authority** and the form is UX, per invariant #2.
 * If the policy changes, `AbhaVerificationPanel.tsx` changes with it or it will describe a rule it
 * does not enforce.
 */
export const ABHA_ADDRESS_POLICY =
  'Between 8 and 18 characters. Letters and numbers, with at most one dot and one underscore, and neither at the start nor the end.';

/**
 * A suggestion may arrive already qualified (`someone@sbx`) while a typed one usually is not, and
 * NHA's rules describe the part before the `@`. Validating the whole string would reject the
 * registry's own suggestions, so the policy is applied to the local part.
 */
export function abhaAddressLocalPart(value: string): string {
  const at = value.indexOf('@');
  return at === -1 ? value : value.slice(0, at);
}

export const AbhaAddressValue = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    const local = abhaAddressLocalPart(value);
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    if (local.length < 8) return fail('An ABHA address is at least 8 characters.');
    if (local.length > 18) return fail('An ABHA address is at most 18 characters.');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._]*[a-zA-Z0-9]$/.test(local)) {
      return fail('An ABHA address uses letters, numbers, dot and underscore, and must start and end with a letter or number.');
    }
    if ((local.match(/\./g) ?? []).length > 1) return fail('An ABHA address may contain at most one dot.');
    if ((local.match(/_/g) ?? []).length > 1) return fail('An ABHA address may contain at most one underscore.');
  });

export const CreateAbhaAddressBody = z.object({
  transactionId: z.string().uuid(),
  abhaAddress: AbhaAddressValue,
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
/**
 * A consent decision reaching us as the HIP (M2 §6.3.1).
 *
 * One callback carries three different events — GRANTED, REVOKED, EXPIRED — told apart only by
 * `notification.status`. Parsed permissively for the same reason `HiuConsentNotifyBody` is: it
 * arrives from outside our control, and a schema strict enough to reject an unfamiliar field would
 * discard the message over a formatting difference.
 *
 * The asymmetry is deliberate. Dropping a **grant** costs a transfer that can be retried; dropping
 * a **revocation** leaves a live authorisation in our table for records the patient has already
 * withdrawn. So the shape is wide here and the strictness lives downstream, where an unrecognised
 * status is treated as "not a grant" rather than ignored.
 */
export const HipConsentNotifyBody = z
  .object({
    notification: z
      .object({
        status: z.string().min(1),
        consentId: z.string().optional(),
        grantAcknowledgement: z.boolean().optional(),
        signature: z.string().optional(),
        consentDetail: z
          .object({
            consentId: z.string().optional(),
            createdAt: z.string().optional(),
            patient: z.object({ id: z.string() }).passthrough().optional(),
            hip: z.object({ id: z.string() }).passthrough().optional(),
            hiu: z.object({ id: z.string() }).passthrough().optional(),
            consentManager: z.object({ id: z.string() }).passthrough().optional(),
            purpose: z
              .object({ text: z.string().optional(), code: z.string().optional(), refUri: z.string().optional() })
              .passthrough()
              .optional(),
            hiTypes: z.array(z.string()).optional(),
            careContexts: z.array(z.object({}).passthrough()).optional(),
            permission: z
              .object({
                accessMode: z.string().optional(),
                dateRange: z
                  .object({ from: z.string().optional(), to: z.string().optional() })
                  .passthrough()
                  .optional(),
                dataEraseAt: z.string().optional(),
                frequency: z
                  .object({
                    unit: z.string().optional(),
                    value: z.coerce.number().optional(),
                    repeats: z.coerce.number().optional(),
                  })
                  .passthrough()
                  .optional(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

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

/**
 * Milestone 4 — a facility's details for the Health Facility Registry (ADR-096).
 *
 * Only `facilityName` is required by us. HFR decides the rest, and mirroring its full required-field
 * set here would mean maintaining two copies of somebody else's contract that drift apart — the
 * registry rejects an incomplete submission with its own message, which is more accurate than
 * anything we could assert locally.
 */
/**
 * One HFR facility registration, as the portal's own form defines it (ADR-096, HFR test cases).
 *
 * Every field below traces to a numbered case in NHA's HFR workbook, and the validation is theirs
 * rather than ours — a facility the portal would reject is one we should reject first, at the desk,
 * instead of after a week of waiting on a human verifier.
 *
 * It is deliberately wide and almost entirely optional. HFR registration is filled over days, by
 * people who do not have the CEA number to hand when they start, so **a draft must be saveable in
 * any state**; completeness is checked at submit, not at save. Everything lands in the row's
 * `payload` jsonb, so widening this shape needs no migration.
 */
export const FacilityRegistryDraftBody = z.object({
  branchId: z.string().uuid().nullish(),
  // HFR-010: alphanumeric, must start with a letter.
  facilityName: z
    .string()
    .min(2)
    .max(200)
    .regex(/^[A-Za-z][A-Za-z0-9 .,'&()/-]*$/, 'The facility name must start with a letter'),
  ownershipCode: z.string().max(32).optional(),
  ownershipSubTypeCode: z.string().max(32).optional(),
  /** HFR-033 — only asked for when the owner is a central-government body. */
  ownershipSubTypeCode2: z.string().max(32).optional(),
  facilityTypeCode: z.string().max(32).optional(),
  facilitySubType: z.string().max(64).optional(),
  /** HFR-034 — a facility may practise more than one system of medicine. */
  systemOfMedicineCodes: z.array(z.string().max(32)).max(12).optional(),
  systemOfMedicineCode: z.string().max(32).optional(),
  specialityTypeCode: z.string().max(32).optional(),
  typeOfServiceCode: z.string().max(32).optional(),
  facilityOperationalStatus: z.string().max(32).optional(),
  address: z.object({
    stateLGDCode: z.string().max(16).optional(),
    districtLGDCode: z.string().max(16).optional(),
    subDistrictLGDCode: z.string().max(16).optional(),
    villageCityTownLGDCode: z.string().max(16).optional(),
    facilityRegion: z.string().max(32).optional(),
    addressLine1: z.string().max(200).optional(),
    addressLine2: z.string().max(200).optional(),
    // HFR-019: exactly six digits.
    pincode: z.string().regex(/^\d{6}$/, 'A pincode is six digits').optional(),
    // HFR-011/012: real numbers, and within India's actual bounds rather than merely parseable.
    latitude: z.coerce.number().min(-90).max(90).transform(String).optional(),
    longitude: z.coerce.number().min(-180).max(180).transform(String).optional(),
  }),
  contact: z.object({
    // HFR-025
    facilityEmailId: z.string().email().optional(),
    // HFR-023/024. The workbook swaps these two descriptions — it asks for "a valid 10 digit mobile
    // number" under Landline and "a valid landline number ranging between 6-8 digits" under Mobile.
    // Implemented the way the fields actually mean, because validating a mobile as a landline would
    // reject every real number typed into it.
    facilityContactNumber: z.string().regex(/^\d{10}$/, 'A mobile number is ten digits').optional(),
    facilityLandlineNumber: z.string().regex(/^\d{6,8}$/, 'A landline number is six to eight digits').optional(),
    facilityStdCode: z.string().max(8).optional(),
    websiteLink: z.string().url().optional(),
  }),
  // HFR-020/021 — working days by master code, hours as a range or 24*7.
  timings: z.array(z.object({ workingDays: z.string(), openingHours: z.string() })).max(7).optional(),

  /**
   * HFR-047…049 — specialities hang off a system of medicine, not off the facility.
   *
   * `isSpecializationAvailable` is the registry's own gate: specialities may only be sent when it is
   * `Y`, so the shape keeps them together rather than letting a form send one without the other.
   */
  medicineServices: z
    .array(
      z.object({
        systemOfMedicineCode: z.string().max(32),
        isSpecializationAvailable: z.enum(['Y', 'N']),
        specialities: z.array(z.string().max(64)).max(60).optional(),
      }),
    )
    .max(12)
    .optional(),

  /**
   * HFR-050…061 — the medical-infrastructure block.
   *
   * Bed counts cap at two digits and the two totals at four, which is HFR's rule rather than a
   * judgement about hospital sizes. The totals are NOT derived here: the workbook asks the operator
   * to state them, and silently computing a number somebody is accountable for would hide a
   * mismatch that the registry itself will question.
   */
  infrastructure: z
    .object({
      countIPDBedsWithoutOxygen: z.coerce.number().int().min(0).max(99).optional(),
      countIPDBedsWithOxygen: z.coerce.number().int().min(0).max(99).optional(),
      countICUBedsWithVentilators: z.coerce.number().int().min(0).max(99).optional(),
      countICUBedsWithoutVentilators: z.coerce.number().int().min(0).max(99).optional(),
      countHDUBedsWithFunctionalVentilators: z.coerce.number().int().min(0).max(99).optional(),
      countHDUBedsWithVentilators: z.coerce.number().int().min(0).max(99).optional(),
      countHDUBedsWithoutVentilators: z.coerce.number().int().min(0).max(99).optional(),
      countDayCareBedsWithoutOxygen: z.coerce.number().int().min(0).max(99).optional(),
      countDayCareBedsWithOxygen: z.coerce.number().int().min(0).max(99).optional(),
      countDentalChairs: z.coerce.number().int().min(0).max(99).optional(),
      totalNumberOfVentilators: z.coerce.number().int().min(0).max(9999).optional(),
      totalNumberOfBeds: z.coerce.number().int().min(0).max(9999).optional(),
    })
    .optional(),

  /**
   * HFR-039…046 — identifiers this facility already holds in other national programmes.
   *
   * All optional and all free-form. The workbook says each "should be a valid <X> Id" without
   * publishing a single format, so validating a shape we cannot know would reject correct numbers.
   * The registry checks them; we carry them faithfully.
   */
  programmeIds: z
    .object({
      nhrrId: z.string().max(64).optional(),
      ninId: z.string().max(64).optional(),
      abPmjayId: z.string().max(64).optional(),
      rohiniId: z.string().max(64).optional(),
      echsId: z.string().max(64).optional(),
      cghsId: z.string().max(64).optional(),
      ceaRegistrationNumber: z.string().max(64).optional(),
      stateInsuranceSchemeId: z.string().max(64).optional(),
    })
    .optional(),
});

export const FacilitySubmitBody = z.object({ branchId: z.string().uuid().nullish() });

/** A verifier's decision, recorded by an operator until HFR offers a status webhook. */
export const FacilityVerificationBody = z.object({
  branchId: z.string().uuid().nullish(),
  status: z.enum(['under_review', 'verified', 'rejected']),
  facilityId: z.string().max(64).optional(),
  message: z.string().max(500).optional(),
});

/**
 * Searching HFR before registering (mirrors their `SearchFacilityRequestDTO`).
 *
 * Every field is optional *here* because the requirement is conditional and Zod is the wrong place
 * to express it: HFR takes either a Facility ID alone, or ownership + state + facility name
 * together. `searchFacilities` enforces that pair of shapes and names what is missing, which is
 * what lets the form mark the right fields.
 *
 * `page` and `resultsPerPage` are coerced because they arrive from a query string, and
 * `resultsPerPage` floors at 10 — HFR's own minimum, below which the request is rejected rather
 * than answered with a smaller page.
 */
export const FacilitySearchQuery = z.object({
  facilityName: z.string().min(2).max(200).optional(),
  // "12-character Facility Id allotted to each facility at the time of submission."
  facilityId: z.string().max(64).optional(),
  ownershipCode: z.string().max(16).optional(),
  stateLGDCode: z.string().max(16).optional(),
  districtLGDCode: z.string().max(16).optional(),
  subDistrictLGDCode: z.string().max(16).optional(),
  pincode: z.string().regex(/^\d{6}$/, 'PIN code must be 6 digits').optional(),
  page: z.coerce.number().int().min(1).max(500).optional(),
  resultsPerPage: z.coerce.number().int().min(10).max(50).optional(),
});

/**
 * Milestone 4 — enrolling a clinician in the professional registry (ADR-097).
 *
 * `aadhaar` is validated for shape and then **never stored**: it is encrypted, sent, and forgotten.
 * The rule is M1's, and it is the reason none of these schemas has a field the row could keep.
 */
export const HprStartBody = z.object({
  providerId: z.string().uuid(),
  aadhaar: z.string().regex(/^\d{12}$/, 'Aadhaar must be 12 digits'),
  category: z.enum(['doctor', 'nurse', 'pharmacist']),
});

export const HprOtpBody = z.object({
  providerId: z.string().uuid(),
  otp: z.string().regex(/^\d{4,8}$/),
});

export const HprMobileBody = z.object({
  providerId: z.string().uuid(),
  mobile: z.string().min(10).max(15),
});

export const HprCompleteBody = z.object({
  providerId: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  registrationCouncil: z.string().min(2).max(120),
  registrationNumber: z.string().min(1).max(64),
  systemOfMedicine: z.string().max(64).optional(),
});

/**
 * A parsed spreadsheet from ABDM's portal (ADR-098).
 *
 * Rows are free-form key/value because the headings belong to ABDM's template, not to us. Capped at
 * 5000: a hospital group's roster fits comfortably, and a larger file is a mistake worth stopping
 * before it becomes 5000 writes.
 */
export const BulkImportBody = z.object({
  rows: z.array(z.record(z.string(), z.string())).min(1).max(5000),
});

/**
 * Resending the code (`CRT_ABHA_106`).
 *
 * The Aadhaar is optional because the mobile flow does not need it — ABDM keys that one on the
 * transaction. When it IS supplied it is validated, used and discarded, exactly as on the first send.
 */
export const ResendOtpBody = z.object({
  transactionId: z.string().uuid(),
  aadhaar: z.string().regex(/^\d{12}$/).optional(),
  mobile: z.string().min(10).max(15).optional(),
});

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
