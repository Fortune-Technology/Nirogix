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
  RequestMobileOtpBody,
  SelectAccountBody,
  StartAadhaarBody,
  StartVerificationBody,
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
