import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requirePermission } from '../../http/requirePermission';
import { SendTestBody } from './notification.schema';
import * as controller from './notification.controller';

export const notificationRouter = Router();

// Send a notification via the configured provider (dev = log provider). Requires notifications.send.
notificationRouter.post(
  '/notifications/test',
  requireAuth,
  requirePermission(PERMISSIONS.NOTIFICATION_SEND),
  validate({ body: SendTestBody }),
  asyncHandler(controller.sendTest),
);

// The tenant's notification log (delivery status). Requires notifications.log.view.
notificationRouter.get(
  '/notifications',
  requireAuth,
  requirePermission(PERMISSIONS.NOTIFICATION_VIEW),
  asyncHandler(controller.list),
);
