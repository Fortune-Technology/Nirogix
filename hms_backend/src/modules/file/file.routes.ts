import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requirePermission } from '../../http/requirePermission';
import { uploadSingle } from './file.upload';
import * as controller from './file.controller';
import { expensiveLimiter } from '../../http/rateLimit';

export const fileRouter = Router();

// Upload — server-side type/size validation in uploadSingle before the handler runs.
fileRouter.post(
  '/files',
  requireAuth,
  requirePermission(PERMISSIONS.FILE_UPLOAD),
  expensiveLimiter,
  uploadSingle('file'),
  asyncHandler(controller.upload),
);

// Content stream — authorized by the short-lived signed token in the query (no session). Used by
// the local dev provider; S3 downloads go directly to a presigned S3 URL instead.
fileRouter.get('/files/content/:id', asyncHandler(controller.content));

// Metadata → short-lived download URL.
fileRouter.get(
  '/files/:id',
  requireAuth,
  requirePermission(PERMISSIONS.FILE_VIEW),
  asyncHandler(controller.getUrl),
);

fileRouter.delete(
  '/files/:id',
  requireAuth,
  requirePermission(PERMISSIONS.FILE_DELETE),
  asyncHandler(controller.remove),
);
