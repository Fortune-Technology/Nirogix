import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requirePermission } from '../../http/requirePermission';
import { uploadSingle } from '../file/file.upload';
import { UpdateBrandingBody } from './branding.schema';
import * as c from './branding.controller';

// Tenant branding (ADR-021). `GET /branding/current` feeds the Portal's session bootstrap and is
// readable by any authenticated user; editing requires `platform.branding.manage` (org_admin).
export const brandingRouter = Router();

brandingRouter.get('/branding/current', requireAuth, asyncHandler(c.getCurrent));

brandingRouter.put(
  '/branding',
  requireAuth,
  requirePermission(PERMISSIONS.BRANDING_MANAGE),
  validate({ body: UpdateBrandingBody }),
  asyncHandler(c.update),
);
brandingRouter.delete(
  '/branding',
  requireAuth,
  requirePermission(PERMISSIONS.BRANDING_MANAGE),
  asyncHandler(c.reset),
);

brandingRouter.post(
  '/branding/logo',
  requireAuth,
  requirePermission(PERMISSIONS.BRANDING_MANAGE),
  uploadSingle('file'),
  asyncHandler(c.uploadLogo),
);
brandingRouter.post(
  '/branding/favicon',
  requireAuth,
  requirePermission(PERMISSIONS.BRANDING_MANAGE),
  uploadSingle('file'),
  asyncHandler(c.uploadFavicon),
);
