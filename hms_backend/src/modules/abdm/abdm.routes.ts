import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { requireAuth } from '../../http/requireAuth';
import { requireModule } from '../../http/requireModule';
import { requirePermission } from '../../http/requirePermission';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { sensitiveLimiter } from '../../http/rateLimit';
import {
  CreateAbhaAddressBody,
  FacilityConfigBody,
  LinkPatientBody,
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
