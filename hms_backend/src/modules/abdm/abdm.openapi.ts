import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import {
  AbdmCapabilitiesSchema,
  AbhaAddressSuggestionsSchema,
  CreateAbhaAddressBody,
  FacilityConfigBody,
  FacilityConfigSchema,
  LinkPatientBody,
  OtpSentSchema,
  PendingShareListSchema,
  HipProfileShareBody,
  BulkImportBody,
  HprCompleteBody,
  HprMobileBody,
  HprOtpBody,
  HprStartBody,
  FacilityRegistryDraftBody,
  FacilitySubmitBody,
  FacilityVerificationBody,
  RequestHistoryBody,
  ResendOtpBody,
  RequestMobileOtpBody,
  SelectAccountBody,
  StartAadhaarBody,
  StartVerificationBody,
  UpdateAbhaProfileBody,
  VerificationResultSchema,
  VerifyAadhaarOtpBody,
  VerifyOtpBody,
} from './abdm.schema';

/**
 * OpenAPI for ABDM Milestone 1 (ADR-084). Generated from the same Zod schemas the routes
 * validate with, so the documentation cannot describe a contract the API does not enforce.
 */

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const forbidden = { description: 'Missing permission / module not entitled', ...json(ErrorResponseSchema) };
const unprocessable = { description: 'Validation error, or consent not recorded', ...json(ErrorResponseSchema) };
const gone = { description: 'The verification expired — start again', ...json(ErrorResponseSchema) };
const upstream = { description: 'ABDM rejected the request or is unavailable', ...json(ErrorResponseSchema) };
const TAG = 'ABDM';

registry.registerPath({
  method: 'get',
  path: '/api/v1/abdm/capabilities',
  operationId: 'getAbdmCapabilities',
  tags: [TAG],
  summary: 'What ABDM can do for this hospital right now',
  description:
    'Drives the registration screen. Scan and Share is only offered when the hospital has an HFR facility id, a QR payload and the flow switched on; the Aadhaar and identifier flows need no facility registration.',
  security: [{ bearerAuth: [] }],
  request: { query: z.object({ branchId: z.string().uuid().optional() }) },
  responses: { 200: { description: 'Capabilities', ...json(AbdmCapabilitiesSchema) }, 401: notAuthed, 403: forbidden },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/abdm/enrolment/aadhaar/otp',
  operationId: 'startAbhaAadhaarEnrolment',
  tags: [TAG],
  summary: 'Send the Aadhaar OTP to create an ABHA',
  description:
    "The Aadhaar number is RSA-encrypted with NHA's certificate before transmission and is never stored or logged — only a masked hint (XXXXXXXX1234) is retained. `consentGiven` must be true; the consent timestamp and version are recorded before the OTP is sent.",
  security: [{ bearerAuth: [] }],
  request: { body: json(StartAadhaarBody) },
  responses: {
    202: { description: 'OTP sent', ...json(OtpSentSchema) },
    401: notAuthed,
    403: forbidden,
    422: unprocessable,
    429: { description: 'Too many OTP requests', ...json(ErrorResponseSchema) },
    502: upstream,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/abdm/enrolment/aadhaar/verify',
  operationId: 'verifyAbhaAadhaarOtp',
  tags: [TAG],
  summary: 'Verify the Aadhaar OTP and return the ABHA profile, prefill and patient match',
  description:
    'Creates the ABHA when the Aadhaar has none. Returns demographics for the registration form plus the new-vs-returning decision — an exact ABHA-number hit is `returning`, a demographic hit is `ambiguous` for a human to confirm. No chart is created here.',
  security: [{ bearerAuth: [] }],
  request: { body: json(VerifyAadhaarOtpBody) },
  responses: {
    200: { description: 'Verified', ...json(VerificationResultSchema) },
    401: { description: 'Not authenticated, or the OTP was rejected by ABDM', ...json(ErrorResponseSchema) },
    403: forbidden,
    410: gone,
    422: unprocessable,
    502: upstream,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/abdm/enrolment/mobile/otp',
  operationId: 'requestAbhaMobileOtp',
  tags: [TAG],
  summary: 'Send the secondary mobile OTP (mobile differs from the Aadhaar-linked number)',
  description:
    'A distinct ABDM sub-flow, not a formality: it decides which linking token is issued, and skipping it produces a token that fails later at care-context linking.',
  security: [{ bearerAuth: [] }],
  request: { body: json(RequestMobileOtpBody) },
  responses: { 202: { description: 'OTP sent', ...json(OtpSentSchema) }, 401: notAuthed, 403: forbidden, 410: gone, 422: unprocessable, 502: upstream },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/abdm/enrolment/mobile/verify',
  operationId: 'verifyAbhaMobileOtp',
  tags: [TAG],
  summary: 'Verify the secondary mobile OTP',
  security: [{ bearerAuth: [] }],
  request: { body: json(VerifyOtpBody) },
  responses: { 200: { description: 'Verified', ...json(VerificationResultSchema) }, 401: notAuthed, 403: forbidden, 410: gone, 502: upstream },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/abdm/transactions/{transactionId}/abha-address/suggestions',
  operationId: 'suggestAbhaAddresses',
  tags: [TAG],
  summary: 'ABHA address suggestions for a newly created ABHA',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ transactionId: z.string().uuid() }) },
  responses: { 200: { description: 'Suggestions', ...json(AbhaAddressSuggestionsSchema) }, 401: notAuthed, 403: forbidden, 410: gone, 502: upstream },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/abdm/abha-address',
  operationId: 'createAbhaAddress',
  tags: [TAG],
  summary: 'Claim the ABHA address the patient chose',
  security: [{ bearerAuth: [] }],
  request: { body: json(CreateAbhaAddressBody) },
  responses: {
    201: { description: 'Created', ...json(z.object({ transactionId: z.string().uuid(), abhaAddress: z.string() })) },
    401: notAuthed,
    403: forbidden,
    409: { description: 'That ABHA address is already taken', ...json(ErrorResponseSchema) },
    410: gone,
    422: unprocessable,
    502: upstream,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/abdm/transactions/{transactionId}/card',
  operationId: 'downloadAbhaCard',
  tags: [TAG],
  summary: 'Download the ABHA card',
  description: 'Streamed straight from ABDM. Never persisted on our side — it carries the patient photo and we already hold the data it renders.',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ transactionId: z.string().uuid() }) },
  responses: {
    200: { description: 'The card image or PDF', content: { 'image/png': { schema: z.string() }, 'application/pdf': { schema: z.string() } } },
    401: notAuthed,
    403: forbidden,
    410: gone,
    422: { description: 'The verification cannot be continued', ...json(ErrorResponseSchema) },
    502: upstream,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/abdm/verification/otp',
  operationId: 'startAbhaVerification',
  tags: [TAG],
  summary: 'Send an OTP to verify an existing ABHA (number / address / mobile / Aadhaar)',
  security: [{ bearerAuth: [] }],
  request: { body: json(StartVerificationBody) },
  responses: { 202: { description: 'OTP sent', ...json(OtpSentSchema) }, 401: notAuthed, 403: forbidden, 422: unprocessable, 429: { description: 'Too many OTP requests', ...json(ErrorResponseSchema) }, 502: upstream },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/abdm/verification/verify',
  operationId: 'verifyAbhaIdentifierOtp',
  tags: [TAG],
  summary: 'Verify the OTP for an existing ABHA',
  description: 'When the identifier resolves to several ABHA accounts (a shared family mobile), the response carries `accounts` and no prefill until one is selected.',
  security: [{ bearerAuth: [] }],
  request: { body: json(VerifyOtpBody) },
  responses: { 200: { description: 'Verified', ...json(VerificationResultSchema) }, 401: notAuthed, 403: forbidden, 410: gone, 502: upstream },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/abdm/verification/select-account',
  operationId: 'selectAbhaAccount',
  tags: [TAG],
  summary: 'Choose one ABHA when the identifier resolved to several',
  security: [{ bearerAuth: [] }],
  request: { body: json(SelectAccountBody) },
  responses: { 200: { description: 'Verified', ...json(VerificationResultSchema) }, 401: notAuthed, 403: forbidden, 410: gone, 502: upstream },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/abdm/pending-shares',
  operationId: 'listAbdmPendingShares',
  tags: [TAG],
  summary: 'Profiles patients have pushed by scanning the facility QR, waiting at the desk',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Pending shares', ...json(PendingShareListSchema) }, 401: notAuthed, 403: forbidden },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/abdm/transactions/{transactionId}',
  operationId: 'getAbdmVerification',
  tags: [TAG],
  summary: 'Re-read a verification (for a screen that reloaded mid-flow)',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ transactionId: z.string().uuid() }) },
  responses: { 200: { description: 'Verification', ...json(VerificationResultSchema) }, 401: notAuthed, 403: forbidden, 404: { description: 'Not found', ...json(ErrorResponseSchema) }, 410: gone },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/abdm/transactions/{transactionId}/dismiss',
  operationId: 'dismissAbdmVerification',
  tags: [TAG],
  summary: 'Close a verification without linking (the operator fell back to the manual form)',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ transactionId: z.string().uuid() }) },
  responses: { 204: { description: 'Dismissed' }, 401: notAuthed, 403: forbidden, 404: { description: 'Not found', ...json(ErrorResponseSchema) } },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/abdm/profile',
  operationId: 'updateAbhaProfile',
  tags: [TAG],
  summary: "Correct the patient's profile at ABDM",
  description:
    "The only Milestone 1 call that WRITES to the national register rather than reading from it, so it carries its own permission (`abdm.profile.update`, deliberately not in the receptionist's default role) and its own audit action, which records which fields changed and never their values. It works only inside a completed verification, because it needs the holder's own X-token — a hospital cannot amend an ABHA it has not just been shown consent for. It does not touch the patient's chart here: correcting the national record and correcting the hospital's record are separate acts.",
  security: [{ bearerAuth: [] }],
  request: { body: json(UpdateAbhaProfileBody) },
  responses: {
    200: { description: 'The profile as ABDM now holds it', ...json(VerificationResultSchema) },
    401: notAuthed,
    403: forbidden,
    410: gone,
    422: { description: 'Nothing to update, or ABDM refused a field', ...json(ErrorResponseSchema) },
    502: upstream,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/abdm/link',
  operationId: 'linkAbhaToPatient',
  tags: [TAG],
  summary: 'Attach a verified ABHA to a patient record',
  description:
    'The only path that may set `abhaVerifiedAt`. A hand-typed ABHA number stays unverified for ever, which is the distinction the field exists to make. Refuses when the ABHA is already on a different chart in this hospital.',
  security: [{ bearerAuth: [] }],
  request: { body: json(LinkPatientBody) },
  responses: {
    200: { description: 'The updated patient', ...json(z.object({ id: z.string().uuid(), uhid: z.string(), abhaNumber: z.string().nullable() })) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Patient or verification not found', ...json(ErrorResponseSchema) },
    409: { description: 'That ABHA is already linked to another patient', ...json(ErrorResponseSchema) },
    410: gone,
    422: unprocessable,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/abdm/facility',
  operationId: 'getAbdmFacility',
  tags: [TAG],
  summary: "The hospital's ABDM/HFR facility registration",
  security: [{ bearerAuth: [] }],
  request: { query: z.object({ branchId: z.string().uuid().optional() }) },
  responses: { 200: { description: 'Facility configuration (null when unconfigured)', ...json(FacilityConfigSchema.nullable()) }, 401: notAuthed, 403: forbidden },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/abdm/facility',
  operationId: 'putAbdmFacility',
  tags: [TAG],
  summary: "Set the hospital's HFR facility id and Scan-and-Share QR",
  description: 'The facility id is issued by NHA to the hospital, never by us. It is sent as X-HIP-ID on outbound calls and is what the Scan-and-Share callback resolves the tenant from.',
  security: [{ bearerAuth: [] }],
  request: { body: json(FacilityConfigBody) },
  responses: { 200: { description: 'Saved', ...json(FacilityConfigSchema) }, 401: notAuthed, 403: forbidden, 422: unprocessable },
});

registry.registerPath({
  method: 'post',
  path: '/api/v3/hip/patient/share',
  operationId: 'abdmProfileShareCallback',
  tags: [TAG],
  summary: 'Scan and Share — ABDM pushes a scanned patient profile (unauthenticated)',
  description:
    "The path is NHA's, not ours: a participant registers one bridge URL and the gateway appends `/api/v3/hip/patient/share`, which is why this is the one route mounted outside `/api/v1` (ADR-084). The tenant is resolved server-side from `metaData.hipId` — never from anything else in the body. It creates a pending verification for a human to act on, never a clinical record, and answers 202 identically for a known, unknown or disabled facility so it cannot be used to enumerate hospitals. The token number the patient sees is returned separately, by calling the gateway's `patient-share/v3/on-share`.",
  request: { body: json(HipProfileShareBody) },
  responses: {
    202: { description: 'Accepted', ...json(z.object({ accepted: z.boolean() })) },
    422: unprocessable,
    429: { description: 'Rate limited', ...json(ErrorResponseSchema) },
  },
});

// --- Milestone 3: a patient's history from other hospitals (ADR-092) --------------------------

const HistoryRequestSchema = z.object({
  id: z.string().uuid(),
  patientId: z.string().uuid(),
  consentRequestId: z.string().nullable(),
  requesterName: z.string(),
  requesterRegistrationNumber: z.string(),
  hiTypes: z.array(z.string()),
  purposeCode: z.string(),
  status: z.string(),
  dataEraseAt: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
  lastError: z.string().nullable(),
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/abdm/history/request',
  operationId: 'abdmRequestPatientHistory',
  tags: [TAG],
  summary: "Ask a patient for permission to read their history at other hospitals",
  description:
    "Sends a consent request to the patient's consent manager. Returns 202 as soon as ABDM acknowledges — the consent request id arrives asynchronously on our `on-init` callback, and the patient grants or denies in their own PHR app, which we do not control. Refused with 422 unless the patient's ABHA address is **verified** (a hand-typed identifier was never proved to be theirs) and unless the requesting doctor has a medical registration number on file, because that is what the patient reads when deciding whether to grant. The purpose is always `CAREMGT`.",
  security: [{ bearerAuth: [] }],
  request: { body: json(RequestHistoryBody) },
  responses: {
    202: { description: 'Request sent to the consent manager', ...json(HistoryRequestSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'No such patient or doctor', ...json(ErrorResponseSchema) },
    422: unprocessable,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/abdm/history/{patientId}',
  operationId: 'abdmListHistoryRequests',
  tags: [TAG],
  summary: "History requests raised for a patient, newest first",
  description:
    'Drives the live status the doctor sees while waiting for the patient to grant, so a request is never a dead end after the button is pressed.',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ patientId: z.string().uuid() }) },
  responses: {
    200: { description: 'Requests', ...json(z.object({ requests: z.array(HistoryRequestSchema) })) },
    401: notAuthed,
    403: forbidden,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/abdm/history/{requestId}/refresh',
  operationId: 'abdmRefreshHistoryRequest',
  tags: [TAG],
  summary: 'Ask ABDM where a consent request got to',
  description:
    'The fallback for a callback that never arrived. A request stuck in `requested` is indistinguishable from one the patient ignored, so the doctor is shown whichever is true.',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ requestId: z.string().uuid() }) },
  responses: {
    200: { description: 'Current status', ...json(HistoryRequestSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'No such request', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/abdm/history/{patientId}/fetch',
  operationId: 'abdmFetchExternalRecords',
  tags: [TAG],
  summary: "Pull the records every granted consent for this patient unlocks",
  description:
    'One request per hospital that granted a consent. Answers 202 because the records arrive later, pushed to our own endpoint on a separate connection — a 200 would imply they are already here. Each consent is re-checked against the clock at the moment of asking, so one revoked since the doctor pressed the button produces no request at all. A hospital that cannot be reached is skipped rather than failing the others: a partial history is worth more than none, provided the doctor is told which sources answered.',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ patientId: z.string().uuid() }) },
  responses: {
    202: {
      description: 'Requests sent',
      ...json(
        z.object({
          requested: z.number(),
          transfers: z.array(z.object({ transferId: z.string(), transactionId: z.string() })),
        }),
      ),
    },
    401: notAuthed,
    403: forbidden,
    503: { description: 'No push URL configured', ...json(ErrorResponseSchema) },
  },
});

const TimelineEntrySchema = z.object({
  id: z.string().uuid(),
  date: z.string().nullable(),
  hiType: z.string(),
  sourceHipId: z.string().nullable(),
  careContextReference: z.string().nullable(),
  title: z.string(),
  author: z.string().nullable(),
  details: z.array(
    z.object({ group: z.string(), label: z.string(), value: z.string(), emphasis: z.literal('abnormal').optional() }),
  ),
  hasAbnormalFinding: z.boolean(),
  receivedAt: z.string(),
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/abdm/history/{patientId}/timeline',
  operationId: 'abdmExternalHistoryTimeline',
  tags: [TAG],
  summary: "A patient's history from other hospitals, merged chronologically",
  description:
    "One timeline across every source rather than a tab per hospital — a prescription from March is only useful beside the diagnosis from February. A record is returned **only while a granted, unexpired consent still covers it**, enforced in the query and measured against the clock, so a record becomes invisible the instant its permission lapses, before the purge sweep runs and whether or not the revocation callback arrived. `hasAbnormalFinding` reflects the SOURCE hospital's own FHIR interpretation codes and is never our own inference — this endpoint arranges records, it never interprets them. The summary carries counts and provenance only, deliberately not a generated clinical summary.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ patientId: z.string().uuid() }),
    query: z.object({ hiTypes: z.string().optional(), sourceHipId: z.string().optional() }),
  },
  responses: {
    200: {
      description: 'Timeline',
      ...json(
        z.object({
          summary: z.object({
            total: z.number(),
            sources: z.array(z.string()),
            byType: z.record(z.string(), z.number()),
            abnormalCount: z.number(),
            earliest: z.string().nullable(),
            latest: z.string().nullable(),
          }),
          entries: z.array(TimelineEntrySchema),
        }),
      ),
    },
    401: notAuthed,
    403: forbidden,
  },
});

// --- Milestone 4: the Health Facility Registry (ADR-096) --------------------------------------

const FacilityRegistrationSchema = z.object({
  id: z.string().uuid(),
  branchId: z.string().uuid().nullable(),
  trackingId: z.string().nullable(),
  facilityId: z.string().nullable(),
  status: z.enum(['draft', 'submitted', 'under_review', 'verified', 'rejected']),
  statusMessage: z.string().nullable(),
  facilityName: z.string(),
  submittedAt: z.string().nullable(),
  verifiedAt: z.string().nullable(),
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/abdm/registry/facilities',
  operationId: 'abdmListFacilityRegistrations',
  tags: [TAG],
  summary: 'Facilities this organisation has registered with HFR, or begun to',
  description:
    'One row per facility — a multi-branch group registers each branch separately, so `branchId` is null for the organisation’s principal facility and set for a branch.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Registrations', ...json(z.object({ registrations: z.array(FacilityRegistrationSchema) })) },
    401: notAuthed,
    403: forbidden,
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/abdm/registry/facility',
  operationId: 'abdmSaveFacilityRegistration',
  tags: [TAG],
  summary: "Save a facility's HFR details without submitting them",
  description:
    'Registration is a long, resumable process, so the form saves locally first and nothing reaches HFR until it is submitted. Only `facilityName` is required here: HFR decides the rest, and duplicating its required-field set would mean maintaining a second copy of somebody else’s contract.',
  security: [{ bearerAuth: [] }],
  request: { body: json(FacilityRegistryDraftBody) },
  responses: {
    200: { description: 'Saved', ...json(FacilityRegistrationSchema) },
    401: notAuthed,
    403: forbidden,
    409: { description: 'Already verified — update instead', ...json(ErrorResponseSchema) },
    422: unprocessable,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/abdm/registry/facility/submit',
  operationId: 'abdmSubmitFacilityRegistration',
  tags: [TAG],
  summary: 'Submit the facility to the Health Facility Registry',
  description:
    "Runs HFR's four-step wizard — basic, additional, detailed, submit — all quoting the tracking id the first step mints. That tracking id is persisted before any later step runs, because losing it means restarting the whole registration. Answers `submitted`, **never** `verified`: HFR routes every registration to a human verifier, and a green tick here would have an administrator believe they hold a Facility ID they do not.",
  security: [{ bearerAuth: [] }],
  request: { body: json(FacilitySubmitBody) },
  responses: {
    202: { description: 'Submitted for verification', ...json(FacilityRegistrationSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Nothing saved to submit', ...json(ErrorResponseSchema) },
    409: { description: 'Not a legal transition from the current status', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/abdm/registry/facility/verification',
  operationId: 'abdmRecordFacilityVerification',
  tags: [TAG],
  summary: "Record the HFR verifier's decision",
  description:
    'Recorded by an operator until HFR offers a status webhook. Approving **adopts the issued Facility ID as the `hipId` M1–M3 already use** — but never overwrites a different id that is already configured, because an integration may be live on it; that conflict is logged for a human instead.',
  security: [{ bearerAuth: [] }],
  request: { body: json(FacilityVerificationBody) },
  responses: {
    200: { description: 'Recorded', ...json(FacilityRegistrationSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'No registration', ...json(ErrorResponseSchema) },
    409: { description: 'Not a legal transition', ...json(ErrorResponseSchema) },
    422: unprocessable,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/abdm/registry/master/{kind}',
  operationId: 'abdmFacilityRegistryMasterData',
  tags: [TAG],
  summary: 'Reference data the HFR registration form needs',
  description:
    'States, districts, sub-districts, facility types, owner sub-types and specialities, proxied from HFR and cached for six hours. Fetched rather than hard-coded: LGD codes are the registry’s to define, and a local copy would drift silently into rejections that look like our bug.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ kind: z.enum(['states', 'districts', 'subDistricts', 'facilityType', 'ownerSubtype', 'specialities']) }),
    query: z.object({ code: z.string().optional() }),
  },
  responses: {
    200: { description: 'Reference list', ...json(z.array(z.record(z.string(), z.unknown()))) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'No such list', ...json(ErrorResponseSchema) },
  },
});

// --- Milestone 4: the Healthcare Professional Registry (ADR-097) ------------------------------

const HprEnrolmentSchema = z.object({
  id: z.string().uuid(),
  providerId: z.string().uuid(),
  hprId: z.string().nullable(),
  status: z.enum(['not_started', 'aadhaar_verified', 'mobile_verified', 'registered', 'already_registered']),
  statusMessage: z.string().nullable(),
  professionalCategory: z.string().nullable(),
  registrationCouncil: z.string().nullable(),
  registrationNumber: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/abdm/registry/professionals',
  operationId: 'abdmListHprEnrolments',
  tags: [TAG],
  summary: 'HPR enrolment state for this hospital’s clinicians',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Enrolments', ...json(z.object({ enrolments: z.array(HprEnrolmentSchema) })) },
    401: notAuthed,
    403: forbidden,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/abdm/registry/professional/start',
  operationId: 'abdmStartHprEnrolment',
  tags: [TAG],
  summary: 'Begin a clinician’s HPR enrolment',
  description:
    'Encrypts the Aadhaar with ABDM’s public certificate (the same helper M1 uses for patients), sends the OTP, and **checks whether this person already holds an HPR id before creating a second one** — a duplicate here is not a spare row, it is a second national identity for a real person. The Aadhaar is never stored, never logged and never echoed back; only ABDM’s transaction reference survives the call.',
  security: [{ bearerAuth: [] }],
  request: { body: json(HprStartBody) },
  responses: {
    202: { description: 'OTP sent', ...json(z.object({ status: z.string(), alreadyRegistered: z.boolean() })) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'No such staff member', ...json(ErrorResponseSchema) },
    409: { description: 'Already enrolled', ...json(ErrorResponseSchema) },
    422: unprocessable,
  },
});

for (const [path, opId, summary, body] of [
  ['/api/v1/abdm/registry/professional/aadhaar-otp', 'abdmVerifyHprAadhaarOtp', 'Verify the Aadhaar OTP', HprOtpBody],
  ['/api/v1/abdm/registry/professional/mobile-otp/verify', 'abdmVerifyHprMobileOtp', 'Verify the mobile OTP', HprOtpBody],
] as const) {
  registry.registerPath({
    method: 'post',
    path,
    operationId: opId,
    tags: [TAG],
    summary,
    description:
      'Part of the resumable enrolment chain. A transaction older than thirty minutes is refused with 410 rather than failing three steps later with a message about something else.',
    security: [{ bearerAuth: [] }],
    request: { body: json(body) },
    responses: {
      200: { description: 'Verified', ...json(HprEnrolmentSchema) },
      401: notAuthed,
      403: forbidden,
      409: { description: 'No enrolment in progress', ...json(ErrorResponseSchema) },
      410: { description: 'The enrolment expired — start again', ...json(ErrorResponseSchema) },
      422: unprocessable,
    },
  });
}

registry.registerPath({
  method: 'post',
  path: '/api/v1/abdm/registry/professional/mobile-otp/send',
  operationId: 'abdmSendHprMobileOtp',
  tags: [TAG],
  summary: 'Send the mobile OTP for an HPR enrolment',
  security: [{ bearerAuth: [] }],
  request: { body: json(HprMobileBody) },
  responses: {
    202: { description: 'Sent', ...json(z.object({ sent: z.boolean() })) },
    401: notAuthed,
    403: forbidden,
    409: { description: 'No enrolment in progress', ...json(ErrorResponseSchema) },
    410: { description: 'The enrolment expired', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/abdm/registry/professional/complete',
  operationId: 'abdmCompleteHprEnrolment',
  tags: [TAG],
  summary: 'Mint the HPR id and register the professional profile',
  description:
    'Two registry calls that belong together: the id first, then the clinical profile that hangs off it — splitting them would leave a doctor holding an id with no council registration against it. On success the verified council registration number is written onto the provider **if that field is blank**, never over an existing value, because M3’s consent requests already need it.',
  security: [{ bearerAuth: [] }],
  request: { body: json(HprCompleteBody) },
  responses: {
    200: { description: 'Registered', ...json(HprEnrolmentSchema) },
    401: notAuthed,
    403: forbidden,
    409: { description: 'Not a legal transition', ...json(ErrorResponseSchema) },
    410: { description: 'The enrolment expired', ...json(ErrorResponseSchema) },
    422: unprocessable,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/abdm/registry/hpr-master/{kind}',
  operationId: 'abdmHprMasterData',
  tags: [TAG],
  summary: 'Reference data the HPR enrolment form needs',
  description: 'Medical and nursing councils, systems of medicine, universities and courses — proxied from HPR and cached.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      kind: z.enum(['states', 'districts', 'subDistricts', 'countries', 'languages', 'systemsOfMedicine', 'medicalCouncils', 'nurseCouncils', 'universities', 'courses']),
    }),
  },
  responses: {
    200: { description: 'Reference list', ...json(z.array(z.record(z.string(), z.unknown()))) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'No such list', ...json(ErrorResponseSchema) },
  },
});

// --- Milestone 4: bulk onboarding (ADR-098) ---------------------------------------------------

const ImportOutcomeSchema = z.object({
  matched: z.number(),
  unmatched: z.array(z.object({ row: z.number(), identifier: z.string(), reason: z.string() })),
  ambiguous: z.array(z.object({ row: z.number(), identifier: z.string(), candidates: z.number() })),
});

const BulkExportSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.string())),
});

for (const [path, opId, what] of [
  ['/api/v1/abdm/registry/bulk/professionals', 'abdmExportBulkProfessionals', 'staff roster'],
  ['/api/v1/abdm/registry/bulk/facilities', 'abdmExportBulkFacilities', 'facility list'],
] as const) {
  registry.registerPath({
    method: 'get',
    path,
    operationId: opId,
    tags: [TAG],
    summary: `Export the ${what} for ABDM’s bulk upload template`,
    description:
      'There is **no bulk-upload API** — both published V4 specs were searched and neither has one, so ABDM’s bulk path is a portal process. This returns the rows so nobody re-keys a roster by hand; the browser turns them into a CSV. Anyone who already holds an id is excluded, because submitting them again invites a duplicate identity. **The column headings are derived from the API contracts, not from ABDM’s downloadable template** — confirm them before a real upload.',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: 'Rows', ...json(BulkExportSchema) },
      401: notAuthed,
      403: forbidden,
    },
  });
}

for (const [path, opId, what] of [
  ['/api/v1/abdm/registry/bulk/professionals', 'abdmImportBulkProfessionals', 'issued HPR ids'],
  ['/api/v1/abdm/registry/bulk/facilities', 'abdmImportBulkFacilities', 'issued facility ids'],
] as const) {
  registry.registerPath({
    method: 'post',
    path,
    operationId: opId,
    tags: [TAG],
    summary: `Read ${what} back from an ABDM bulk upload`,
    description:
      'Matching is **strict, and ambiguity is refused rather than guessed**: registration number first, then an exact full name, and only when it identifies exactly one active person. A row matching two people is reported and skipped — attaching a real person’s national identity to the wrong staff record is a defect nobody would notice, and a row a human must look at costs far less. There is deliberately no fuzzy matching.',
    security: [{ bearerAuth: [] }],
    request: { body: json(BulkImportBody) },
    responses: {
      200: { description: 'What matched, and what a human must look at', ...json(ImportOutcomeSchema) },
      401: notAuthed,
      403: forbidden,
      422: unprocessable,
    },
  });
}

registry.registerPath({
  method: 'get',
  path: '/api/v1/abdm/consents',
  operationId: 'abdmListHeldConsents',
  tags: [TAG],
  summary: "Consents other providers hold over this hospital's records",
  description:
    'Certification requires all three consent cases — grant, revoke and expire — to be "seen in HMIS", so this exists to be looked at rather than only to be correct. `consents` is the live set of permissions we currently hold. `history` is drawn from the audit trail and therefore still shows a consent that has been **revoked or expired and deleted** — the artefact is the permission and it is destroyed (ADR-087), while the record that it existed and ended is metadata only and is never deleted. That is what makes a revocation watchable: the row leaves the list and appears in the history.',
  security: [{ bearerAuth: [] }],
  request: { query: z.object({ abhaAddress: z.string().optional() }) },
  responses: {
    200: {
      description: 'Held consents and their history',
      ...json(
        z.object({
          consents: z.array(
            z.object({
              consentId: z.string(),
              abhaAddress: z.string(),
              hiuId: z.string().nullable(),
              hipId: z.string().nullable(),
              purposeCode: z.string().nullable(),
              hiTypes: z.array(z.string()),
              accessMode: z.string().nullable(),
              dataEraseAt: z.string().nullable(),
              grantedAt: z.string().nullable(),
            }),
          ),
          history: z.array(
            z.object({
              consentId: z.string(),
              event: z.enum(['granted', 'revoked', 'expired', 'erased']),
              hiuId: z.string().optional(),
              recordedAt: z.string(),
            }),
          ),
        }),
      ),
    },
    401: notAuthed,
    403: forbidden,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/abdm/otp/resend',
  operationId: 'abdmResendOtp',
  tags: [TAG],
  summary: 'Send the verification code again',
  description:
    'ABDM publishes no resend endpoint — a resend is the same request repeated — so the rule from `CRT_ABHA_106` (at most twice, sixty seconds apart) is enforced here, **on the transaction rather than in the browser**: a reloaded page, a second tab or a direct call must not be able to spend a patient’s daily UIDAI allowance. The Aadhaar flow requires the number to be supplied again, which is deliberate: we never store an Aadhaar, so there is nothing to replay, and re-sending what the browser still holds costs nothing while storing it would create exactly the liability the design avoids. The mobile flow needs no re-entry because ABDM keys it on the transaction.',
  security: [{ bearerAuth: [] }],
  request: { body: json(ResendOtpBody) },
  responses: {
    202: {
      description: 'Code sent again',
      ...json(z.object({ transactionId: z.string(), mobileHint: z.string().optional(), resendsLeft: z.number() })),
    },
    401: notAuthed,
    403: forbidden,
    409: { description: 'The verification is already finished', ...json(ErrorResponseSchema) },
    410: { description: 'The verification expired — start again', ...json(ErrorResponseSchema) },
    422: unprocessable,
    429: { description: 'Too soon, or the three-send limit is reached', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/abdm/history/lookup/abha',
  operationId: 'abdmLookupAbha',
  tags: [TAG],
  summary: 'Find the patient an ABHA number or address belongs to',
  description:
    'Closes `HIU_FLOW_101`, which asks the HIU to find a patient by ABHA Number **or** Address and check the ABHA is valid. It deliberately does **not** invent an ABDM lookup call — no such endpoint exists in the published M1 collection, and guessing one is how the M2 service-registration payload came out wrong. The validity check that genuinely exists is M1’s verification flow, which puts an OTP in front of the patient; so this returns the local match plus the honest next step, and the caller runs that proven flow. Both identifier forms find the same person, and the number is matched on digits alone so formatting is not a second lookup.',
  security: [{ bearerAuth: [] }],
  request: { query: z.object({ identifier: z.string().min(3) }) },
  responses: {
    200: {
      description: 'What we hold for that ABHA, and what to do next',
      ...json(
        z.object({
          outcome: z.enum(['verified', 'unverified', 'not_found', 'ambiguous']),
          patient: z
            .object({
              id: z.string().uuid(),
              uhid: z.string(),
              name: z.string(),
              abhaAddress: z.string().nullable(),
              abhaNumber: z.string().nullable(),
            })
            .optional(),
          nextStep: z.string(),
        }),
      ),
    },
    401: notAuthed,
    403: forbidden,
    422: unprocessable,
  },
});
