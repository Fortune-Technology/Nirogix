import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requirePermission } from '../../http/requirePermission';
import { uploadSingle } from '../file/file.upload';
import { UpdatePlatformBrandingBody } from './platformBranding.schema';
import * as c from './platformBranding.controller';

// Platform branding (ADR-024). Two independent scopes: `marketing` + `hms`.
// The GET is PUBLIC (no auth) so the cross-origin marketing site can read its scope;
// writes are Super-Admin only via PLATFORM_BRANDING_MANAGE (which only a WILDCARD
// super_admin resolves — org_admin never holds it).
export const platformBrandingRouter = Router();

platformBrandingRouter.get('/public/branding/:scope', asyncHandler(c.getPublic));

const guard = [requireAuth, requirePermission(PERMISSIONS.PLATFORM_BRANDING_MANAGE)] as const;

platformBrandingRouter.put(
  '/platform-branding/:scope',
  ...guard,
  validate({ body: UpdatePlatformBrandingBody }),
  asyncHandler(c.update),
);
platformBrandingRouter.delete('/platform-branding/:scope', ...guard, asyncHandler(c.reset));
platformBrandingRouter.post('/platform-branding/:scope/logo', ...guard, uploadSingle('file'), asyncHandler(c.uploadLogo));
platformBrandingRouter.post('/platform-branding/:scope/favicon', ...guard, uploadSingle('file'), asyncHandler(c.uploadFavicon));
