import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth, requirePatientAuth } from '../../http/requireAuth';
import { requirePermission } from '../../http/requirePermission';
import { authLimiter, sensitiveLimiter } from '../../http/rateLimit';
import {
  RequestCodeBody,
  VerifyCodeBody,
  GrantPortalAccessBody,
  TenantParam,
  PageQuery,
} from './patientIdentity.schema';
import * as c from './patientIdentity.controller';

/**
 * The patient portal's API (ADR-052).
 *
 * Three things about this router are load-bearing:
 *
 * 1. **`requirePatientAuth`, never `requireAuth`.** These routes accept only a patient
 *    principal; a staff token is refused here just as a patient token is refused on
 *    every staff route. The boundary is enforced in both directions rather than
 *    trusting that staff would not call a patient endpoint.
 * 2. **No route creates a link.** There is no self-service path from "I know this phone
 *    number" to "I can read this chart". Access is granted by the hospital, on the
 *    staff routes at the bottom of this file.
 * 3. **The tenant is a path parameter but never a trust boundary.** Every read resolves
 *    the tenant against an ACTIVE link for this identity first, and the patient id it
 *    filters on comes from that link — never from the request.
 *
 * The two unauthenticated endpoints are rate-limited at the sign-in tier: they take a
 * contact and send or check a code, which is exactly the surface credential stuffing
 * targets.
 */
export const patientIdentityRouter = Router();

patientIdentityRouter.post(
  '/patient/auth/request-code',
  authLimiter,
  validate({ body: RequestCodeBody }),
  asyncHandler(c.requestCode),
);

patientIdentityRouter.post(
  '/patient/auth/verify',
  authLimiter,
  validate({ body: VerifyCodeBody }),
  asyncHandler(c.verifyCode),
);

// Refresh and sign-out sit under `/patient/auth`, which is exactly the path the patient
// refresh cookie is scoped to — so the cookie is sent here and nowhere else (F-8).
patientIdentityRouter.post('/patient/auth/refresh', authLimiter, asyncHandler(c.refreshSession));
patientIdentityRouter.post('/patient/auth/logout', asyncHandler(c.signOut));

patientIdentityRouter.get('/patient/hospitals', requirePatientAuth, asyncHandler(c.myHospitals));

patientIdentityRouter.get(
  '/patient/hospitals/:tenantId/profile',
  requirePatientAuth,
  validate({ params: TenantParam }),
  asyncHandler(c.profile),
);

patientIdentityRouter.get(
  '/patient/hospitals/:tenantId/appointments',
  requirePatientAuth,
  validate({ params: TenantParam, query: PageQuery }),
  asyncHandler(c.appointments),
);

patientIdentityRouter.get(
  '/patient/hospitals/:tenantId/invoices',
  requirePatientAuth,
  validate({ params: TenantParam, query: PageQuery }),
  asyncHandler(c.invoices),
);

patientIdentityRouter.get(
  '/patient/hospitals/:tenantId/lab-reports',
  requirePatientAuth,
  validate({ params: TenantParam }),
  asyncHandler(c.labReports),
);

// ---- Hospital-side: the hospital grants and withdraws portal access ---------
// Staff routes, so `requireAuth` (which refuses a patient principal by type). Granting
// portal access is part of registering a patient, which is why it sits on the patient
// permissions rather than needing one of its own.

patientIdentityRouter.post(
  '/patients/:id/portal-access',
  requireAuth,
  requirePermission(PERMISSIONS.PATIENT_CREATE),
  sensitiveLimiter,
  validate({ body: GrantPortalAccessBody }),
  asyncHandler(c.grantPortalAccess),
);

// Revoke sits on the SAME permission as grant, not on `patient.record.update`.
// Withdrawing access must never be harder than granting it: the front desk provisions
// portal access during registration, and if only a doctor could take it back, the
// person best placed to notice a mistake would have to find someone else to fix it.
patientIdentityRouter.delete(
  '/patients/:id/portal-access',
  requireAuth,
  requirePermission(PERMISSIONS.PATIENT_CREATE),
  asyncHandler(c.revokePortalAccess),
);
