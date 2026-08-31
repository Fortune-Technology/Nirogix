import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { requireAuth } from '../../http/requireAuth';
import { requireModule } from '../../http/requireModule';
import { requirePermission } from '../../http/requirePermission';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { authLimiter, sensitiveLimiter } from '../../http/rateLimit';
import {
  CreateAbhaAddressBody,
  FacilityConfigBody,
  LinkPatientBody,
  BulkImportBody,
  HprCompleteBody,
  HprMobileBody,
  HprOtpBody,
  HprStartBody,
  FacilityRegistryDraftBody,
  FacilitySearchQuery,
  FacilitySubmitBody,
  FacilityVerificationBody,
  RequestHistoryBody,
  ResendOtpBody,
  RequestMobileOtpBody,
  SelectAccountBody,
  StartAadhaarBody,
  StartVerificationBody,
  UpdateAbhaProfileBody,
  TransactionParams,
  VerifyAadhaarOtpBody,
  VerifyOtpBody,
} from './abdm.schema';
import * as c from './abdm.controller';

/**
 * ABDM Milestone 1 routes (ADR-084).
 *
 * Everything except the Scan-and-Share callback is `requireAuth → requireModule('abdm') →
 * requirePermission`. The module gate matters as much as the permission one: a hospital that has
 * not registered with NHA is not entitled to `abdm`, and its staff get a 403 from the API even if
 * someone hands them the URL.
 *
 * **Rate limits are the sign-in tier, not the general one.** Every OTP route sends a message to a
 * real phone and burns one of the sandbox's small daily allowance; the callback is unauthenticated
 * and therefore reachable by anyone who learns the path.
 */
export const abdmRouter = Router();
const mod = requireModule('abdm');

// The route ABDM itself calls lives in `abdm.gatewayRoutes.ts`, mounted at the root: the gateway
// appends its own fixed path to the registered bridge URL, so it cannot sit under `/api/v1`.

// --- What the registration screen may offer ---------------------------------------------------
abdmRouter.get('/abdm/capabilities', requireAuth, mod, requirePermission(PERMISSIONS.ABDM_VERIFY), asyncHandler(c.capabilities));

// --- Flow 1: create an ABHA with Aadhaar OTP --------------------------------------------------
abdmRouter.post(
  '/abdm/enrolment/aadhaar/otp',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_VERIFY),
  sensitiveLimiter,
  validate({ body: StartAadhaarBody }),
  asyncHandler(c.startAadhaar),
);
abdmRouter.post(
  '/abdm/enrolment/aadhaar/verify',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_VERIFY),
  sensitiveLimiter,
  validate({ body: VerifyAadhaarOtpBody }),
  asyncHandler(c.verifyAadhaar),
);
abdmRouter.post(
  '/abdm/enrolment/mobile/otp',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_VERIFY),
  sensitiveLimiter,
  validate({ body: RequestMobileOtpBody }),
  asyncHandler(c.requestMobileOtp),
);
abdmRouter.post(
  '/abdm/enrolment/mobile/verify',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_VERIFY),
  sensitiveLimiter,
  validate({ body: VerifyOtpBody }),
  asyncHandler(c.verifyMobileOtp),
);
abdmRouter.get(
  '/abdm/transactions/:transactionId/abha-address/suggestions',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_VERIFY),
  validate({ params: TransactionParams }),
  asyncHandler(c.suggestAddresses),
);
abdmRouter.post(
  '/abdm/abha-address',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_VERIFY),
  validate({ body: CreateAbhaAddressBody }),
  asyncHandler(c.createAddress),
);
abdmRouter.get(
  '/abdm/transactions/:transactionId/card',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_VERIFY),
  validate({ params: TransactionParams }),
  asyncHandler(c.downloadCard),
);

// --- Flow 3: verify an existing ABHA ----------------------------------------------------------
abdmRouter.post(
  '/abdm/verification/otp',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_VERIFY),
  sensitiveLimiter,
  validate({ body: StartVerificationBody }),
  asyncHandler(c.startVerification),
);
abdmRouter.post(
  '/abdm/verification/verify',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_VERIFY),
  sensitiveLimiter,
  validate({ body: VerifyOtpBody }),
  asyncHandler(c.verifyIdentifier),
);
abdmRouter.post(
  '/abdm/verification/select-account',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_VERIFY),
  validate({ body: SelectAccountBody }),
  asyncHandler(c.selectAccount),
);

// --- Flow 2: what the desk sees from Scan and Share -------------------------------------------
abdmRouter.get('/abdm/pending-shares', requireAuth, mod, requirePermission(PERMISSIONS.ABDM_VERIFY), asyncHandler(c.pendingShares));

// --- Transaction lifecycle --------------------------------------------------------------------
abdmRouter.get(
  '/abdm/transactions/:transactionId',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_VERIFY),
  validate({ params: TransactionParams }),
  asyncHandler(c.getVerification),
);
abdmRouter.post(
  '/abdm/transactions/:transactionId/dismiss',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_VERIFY),
  validate({ params: TransactionParams }),
  asyncHandler(c.dismiss),
);

// Amending the profile at ABDM writes to the NATIONAL register, not to ours — the only M1 call
// that does. Its own permission, deliberately absent from the receptionist's default set.
abdmRouter.patch(
  '/abdm/profile',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_PROFILE_UPDATE),
  validate({ body: UpdateAbhaProfileBody }),
  asyncHandler(c.updateProfile),
);

// Attaching a verified ABHA to a chart changes an identifier on a clinical record, so it carries
// its own permission rather than riding on the one that runs the lookup.
abdmRouter.post(
  '/abdm/link',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_LINK),
  validate({ body: LinkPatientBody }),
  asyncHandler(c.linkPatient),
);

// --- Facility configuration (org_admin) -------------------------------------------------------
abdmRouter.get('/abdm/facility', requireAuth, mod, requirePermission(PERMISSIONS.ABDM_FACILITY_VIEW), asyncHandler(c.getFacility));
abdmRouter.put(
  '/abdm/facility',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_FACILITY_MANAGE),
  validate({ body: FacilityConfigBody }),
  asyncHandler(c.putFacility),
);

// --- Milestone 3: a patient's history from other hospitals (ADR-092) --------------------------
//
// Two permissions, not one. Requesting puts this doctor's name and registration number in front of
// the patient and creates an obligation to destroy what comes back; reading is another hospital's
// clinical record. A role that may open a chart is not thereby entitled to pull a national history
// onto it.
abdmRouter.post(
  '/abdm/history/request',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_HISTORY_REQUEST),
  validate({ body: RequestHistoryBody }),
  asyncHandler(c.requestHistory),
);

abdmRouter.get(
  '/abdm/history/:patientId',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_HISTORY_VIEW),
  asyncHandler(c.listHistoryRequests),
);

abdmRouter.post(
  '/abdm/history/:requestId/refresh',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_HISTORY_VIEW),
  asyncHandler(c.refreshHistoryRequest),
);

// Pulling the records themselves. Same permission as requesting: it is the act that puts another
// hospital's clinical data on our disk and starts the destruction clock.
abdmRouter.post(
  '/abdm/history/:patientId/fetch',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_HISTORY_REQUEST),
  asyncHandler(c.fetchExternalRecords),
);

// Reading the pulled history. `view`, not `request`: reading is a different act from asking, and a
// record whose consent has lapsed is filtered out by the query itself.
abdmRouter.get(
  '/abdm/history/:patientId/timeline',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_HISTORY_VIEW),
  asyncHandler(c.externalHistoryTimeline),
);

// --- Milestone 4: the Health Facility Registry (ADR-096) --------------------------------------
//
// Its own permissions, not `abdm.facility.*`: those edit the LOCAL configuration, while these
// submit the organisation's details to a government registry under its name.
abdmRouter.get(
  '/abdm/registry/facilities',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_REGISTRY_VIEW),
  asyncHandler(c.listFacilityRegistrations),
);

abdmRouter.put(
  '/abdm/registry/facility',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_REGISTRY_MANAGE),
  validate({ body: FacilityRegistryDraftBody }),
  asyncHandler(c.saveFacilityRegistration),
);

abdmRouter.post(
  '/abdm/registry/facility/submit',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_REGISTRY_MANAGE),
  validate({ body: FacilitySubmitBody }),
  asyncHandler(c.submitFacilityRegistration),
);

abdmRouter.post(
  '/abdm/registry/facility/verification',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_REGISTRY_MANAGE),
  validate({ body: FacilityVerificationBody }),
  asyncHandler(c.recordFacilityVerification),
);

// Amending a facility HFR has already verified. Its own path, not the save route's PUT: `saveDraft`
// refuses once a registration is verified so that nobody re-registers a building that already holds
// a Facility ID, and sharing a path would make that refusal reachable only by accident.
abdmRouter.post(
  '/abdm/registry/facility/update',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_REGISTRY_MANAGE),
  validate({ body: FacilityRegistryDraftBody }),
  asyncHandler(c.updateFacilityRegistration),
);

// Searching HFR before registering, so one building never gets two national identities. Read-only,
// so `view` is enough — and the service refuses a search with no filter rather than paging the
// whole national registry.
abdmRouter.get(
  '/abdm/registry/facility/search',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_REGISTRY_VIEW),
  validate({ query: FacilitySearchQuery }),
  asyncHandler(c.searchFacilityRegistry),
);

// Reference data for the form. Read-only, and `view` is enough to render a picker.
abdmRouter.get(
  '/abdm/registry/master/:kind',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_REGISTRY_VIEW),
  asyncHandler(c.facilityRegistryMasterData),
);

// --- Milestone 4: the Healthcare Professional Registry (ADR-097) ------------------------------
//
// Same permissions as the facility registry: enrolling staff in a national registry is an
// organisational act, and the Aadhaar handling alone puts it beyond ordinary staff management.
const registryManage = requirePermission(PERMISSIONS.ABDM_REGISTRY_MANAGE);

abdmRouter.get('/abdm/registry/professionals', requireAuth, mod, requirePermission(PERMISSIONS.ABDM_REGISTRY_VIEW), asyncHandler(c.listHprEnrolments));
abdmRouter.post('/abdm/registry/professional/start', requireAuth, mod, registryManage, validate({ body: HprStartBody }), asyncHandler(c.startHprEnrolment));
abdmRouter.post('/abdm/registry/professional/aadhaar-otp', requireAuth, mod, registryManage, validate({ body: HprOtpBody }), asyncHandler(c.verifyHprAadhaarOtp));
abdmRouter.post('/abdm/registry/professional/mobile-otp/send', requireAuth, mod, registryManage, validate({ body: HprMobileBody }), asyncHandler(c.sendHprMobileOtp));
abdmRouter.post('/abdm/registry/professional/mobile-otp/verify', requireAuth, mod, registryManage, validate({ body: HprOtpBody }), asyncHandler(c.verifyHprMobileOtp));
abdmRouter.post('/abdm/registry/professional/complete', requireAuth, mod, registryManage, validate({ body: HprCompleteBody }), asyncHandler(c.completeHprEnrolment));
abdmRouter.get('/abdm/registry/hpr-master/:kind', requireAuth, mod, requirePermission(PERMISSIONS.ABDM_REGISTRY_VIEW), asyncHandler(c.hprMasterData));

// --- Milestone 4: bulk onboarding (ADR-098) ---------------------------------------------------
abdmRouter.get('/abdm/registry/bulk/professionals', requireAuth, mod, requirePermission(PERMISSIONS.ABDM_REGISTRY_VIEW), asyncHandler(c.exportBulkProfessionals));
abdmRouter.get('/abdm/registry/bulk/facilities', requireAuth, mod, requirePermission(PERMISSIONS.ABDM_REGISTRY_VIEW), asyncHandler(c.exportBulkFacilities));
abdmRouter.post('/abdm/registry/bulk/professionals', requireAuth, mod, registryManage, validate({ body: BulkImportBody }), asyncHandler(c.importBulkProfessionals));
abdmRouter.post('/abdm/registry/bulk/facilities', requireAuth, mod, registryManage, validate({ body: BulkImportBody }), asyncHandler(c.importBulkFacilities));

// The consents other providers hold over this hospital's records (ADR-100). Read-only, and behind
// the facility-view permission: it is hospital configuration, not a clinical screen.
abdmRouter.get(
  '/abdm/consents',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_FACILITY_VIEW),
  asyncHandler(c.listHeldConsents),
);

// Resend the code (CRT_ABHA_106). Rate-limited at the sign-in tier on top of the per-transaction
// cap, because this endpoint spends a patient's UIDAI allowance.
abdmRouter.post(
  '/abdm/otp/resend',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_VERIFY),
  authLimiter,
  validate({ body: ResendOtpBody }),
  asyncHandler(c.resendOtp),
);

// Find a patient by ABHA before requesting their history (HIU_FLOW_101). Read-only, so `view` is
// enough — raising the request itself still needs `abdm.history.request`.
abdmRouter.get(
  '/abdm/history/lookup/abha',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.ABDM_HISTORY_VIEW),
  asyncHandler(c.lookupAbha),
);
