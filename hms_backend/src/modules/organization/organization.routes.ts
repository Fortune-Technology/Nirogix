import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requirePermission } from '../../http/requirePermission';
import { UpdateOrganizationProfileBody } from './organization.schema';
import * as c from './organization.controller';

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
