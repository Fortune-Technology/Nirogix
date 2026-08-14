import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { requireAuth } from '../../http/requireAuth';
import { requireModule } from '../../http/requireModule';
import { requirePermission } from '../../http/requirePermission';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { CheckInBody, UpdateVisitStatusBody } from './opd.schema';
import * as c from './opd.controller';

// OPD visit / check-in / queue — gated by the `opd` module entitlement.
export const opdRouter = Router();
const mod = requireModule('opd');

opdRouter.get('/visits', requireAuth, mod, requirePermission(PERMISSIONS.OPD_VIEW), asyncHandler(c.listQueue));
opdRouter.get('/visits/:id', requireAuth, mod, requirePermission(PERMISSIONS.OPD_VIEW), asyncHandler(c.getVisit));
opdRouter.post(
  '/visits/check-in',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.OPD_CHECKIN),
  validate({ body: CheckInBody }),
  asyncHandler(c.checkIn),
);
opdRouter.patch(
  '/visits/:id/status',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.OPD_UPDATE),
  validate({ body: UpdateVisitStatusBody }),
  asyncHandler(c.updateStatus),
);
