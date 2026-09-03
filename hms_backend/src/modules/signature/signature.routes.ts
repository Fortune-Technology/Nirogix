import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requirePermission } from '../../http/requirePermission';
import { expensiveLimiter } from '../../http/rateLimit';
import { uploadSingle } from '../file/file.upload';
import * as c from './signature.controller';

/**
 * A person's own electronic signature (ADR-137).
 *
 * `/me/signature` and nothing else — there is deliberately no `/users/:id/signature`. An
 * administrator holding every permission in the system cannot upload a signature in a
 * clinician's name, because the route to do it does not exist. That is a stronger guarantee than
 * a permission check, which is a line of code somebody can delete.
 *
 * No module gate: signing is not a module a hospital subscribes to, it is something people in
 * several modules do. `platform.signature.manage` is the whole boundary.
 */
export const signatureRouter = Router();

signatureRouter.get(
  '/me/signature',
  requireAuth,
  requirePermission(PERMISSIONS.SIGNATURE_MANAGE),
  asyncHandler(c.listMine),
);

signatureRouter.post(
  '/me/signature',
  requireAuth,
  requirePermission(PERMISSIONS.SIGNATURE_MANAGE),
  expensiveLimiter,
  // Reuses the file module's upload middleware, which validates size, declared MIME *and* the
  // actual bytes before the handler runs. The service narrows it further to three image types.
  uploadSingle('file'),
  asyncHandler(c.upload),
);

signatureRouter.delete(
  '/me/signature',
  requireAuth,
  requirePermission(PERMISSIONS.SIGNATURE_MANAGE),
  asyncHandler(c.remove),
);
