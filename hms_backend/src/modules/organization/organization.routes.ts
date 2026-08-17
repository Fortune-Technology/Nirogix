import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requirePermission } from '../../http/requirePermission';
import { authLimiter, sensitiveLimiter } from '../../http/rateLimit';
import { uploadSingle } from '../file/file.upload';
import { UpdateOrganizationProfileBody } from './organization.schema';
import { SubmitRegistrationBody, SetSelfRegistrationBody, RejectRegistrationBody } from './registration.schema';
import * as c from './organization.controller';
import * as reg from './registration.controller';

/**
 * The hospital's own identity (ADR-049).
 *
 * Reading is open to any authenticated user of that hospital, exactly like
 * `GET /branding/current`: printed documents and the Portal header need the organization's
 * name and address, and the data is the hospital's own — RLS makes "any authenticated user"
 * mean "any authenticated user OF THIS TENANT". Writing requires
 * `platform.organization.manage`, held by org_admin.
 */
export const organizationRouter = Router();

organizationRouter.get('/organization/profile', requireAuth, asyncHandler(c.getProfile));

organizationRouter.put(
  '/organization/profile',
  requireAuth,
  requirePermission(PERMISSIONS.ORG_PROFILE_MANAGE),
  validate({ body: UpdateOrganizationProfileBody }),
  asyncHandler(c.updateProfile),
);

// The letterhead image (ADR-065) — same permission as the rest of the identity it prints as.
organizationRouter.post(
  '/organization/profile/letterhead-image',
  requireAuth,
  requirePermission(PERMISSIONS.ORG_PROFILE_MANAGE),
  uploadSingle('file'),
  asyncHandler(c.uploadLetterheadImage),
);
organizationRouter.delete(
  '/organization/profile/letterhead-image',
  requireAuth,
  requirePermission(PERMISSIONS.ORG_PROFILE_MANAGE),
  asyncHandler(c.removeLetterheadImage),
);

/**
 * Patient self-registration (ADR-056).
 *
 * The two public routes are the only unauthenticated write path into a hospital's data in
 * the whole product, so they are the ones to read carefully:
 *
 * - **The tenant comes from the token in the path**, resolved server-side. Never from the
 *   body, a header or a query parameter — which is what makes "a QR for Hospital A cannot
 *   register a patient under Hospital B" structural rather than a rule someone can forget.
 * - **They write a REQUEST, not a patient.** ADR-052's invariant holds: the hospital still
 *   decides who becomes a patient record.
 * - **Rate-limited at the sign-in tier**, because a public form behind a printed poster is
 *   exactly what a script finds.
 * - An unknown token, a retired token and a hospital with registration switched off all
 *   fail identically, so the endpoint never reveals which hospitals exist.
 */
organizationRouter.get('/public/registration/:token', authLimiter, asyncHandler(reg.publicContext));
organizationRouter.post(
  '/public/registration/:token',
  authLimiter,
  validate({ body: SubmitRegistrationBody }),
  asyncHandler(reg.publicSubmit),
);

// Hospital side, split along the line that matters: **seeing** the queue is a read,
// **converting** a request is the moment the hospital takes responsibility for a chart.
//
// They cannot share one permission. Approving has to stay `patient.record.create`, but
// binding the list to it too locked out the org_admin who switches registration on and
// prints the QR — the one person guaranteed to look for whether anything arrived. Reading
// the queue is therefore `patient.record.view`, which every clinical role already holds.
organizationRouter.get(
  '/registration-requests',
  requireAuth,
  requirePermission(PERMISSIONS.PATIENT_VIEW),
  asyncHandler(reg.listRequests),
);
organizationRouter.post(
  '/registration-requests/:id/approve',
  requireAuth,
  requirePermission(PERMISSIONS.PATIENT_CREATE),
  asyncHandler(reg.approve),
);
organizationRouter.post(
  '/registration-requests/:id/reject',
  requireAuth,
  requirePermission(PERMISSIONS.PATIENT_CREATE),
  validate({ body: RejectRegistrationBody }),
  asyncHandler(reg.reject),
);

// Turning self-registration on, and retiring a printed QR, are organization configuration.
organizationRouter.get(
  '/organization/registration',
  requireAuth,
  requirePermission(PERMISSIONS.ORG_PROFILE_MANAGE),
  asyncHandler(reg.getSettings),
);
organizationRouter.put(
  '/organization/registration',
  requireAuth,
  requirePermission(PERMISSIONS.ORG_PROFILE_MANAGE),
  validate({ body: SetSelfRegistrationBody }),
  asyncHandler(reg.setEnabled),
);
organizationRouter.post(
  '/organization/registration/regenerate',
  requireAuth,
  requirePermission(PERMISSIONS.ORG_PROFILE_MANAGE),
  sensitiveLimiter,
  asyncHandler(reg.regenerate),
);
