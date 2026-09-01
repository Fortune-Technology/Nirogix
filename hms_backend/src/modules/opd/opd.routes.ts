import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { requireAuth } from '../../http/requireAuth';
import { requireModule } from '../../http/requireModule';
import { requireCapability } from '../../http/requireCapability';
import { requirePermission } from '../../http/requirePermission';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { CheckInBody, UpdateVisitStatusBody } from './opd.schema';
import { CloseCaseBody, OpenCaseBody, ReopenCaseBody, UpdateCaseBody } from './case.schema';
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

// Treatment cases (ADR-116) — gated by the `opd` module, then the `opd.case` capability, then
// permission. The desk opens a case as part of checking a patient in, which is why the front-desk
// role holds `opd.case.manage` and not only the view key.
const caseCap = requireCapability('opd', 'opd.case');

opdRouter.get('/cases', requireAuth, mod, caseCap, requirePermission(PERMISSIONS.CASE_VIEW), asyncHandler(c.listCases));
opdRouter.get('/cases/:id', requireAuth, mod, caseCap, requirePermission(PERMISSIONS.CASE_VIEW), asyncHandler(c.getCase));
opdRouter.post(
  '/cases',
  requireAuth,
  mod,
  caseCap,
  requirePermission(PERMISSIONS.CASE_MANAGE),
  validate({ body: OpenCaseBody }),
  asyncHandler(c.openCase),
);
opdRouter.patch(
  '/cases/:id',
  requireAuth,
  mod,
  caseCap,
  requirePermission(PERMISSIONS.CASE_MANAGE),
  validate({ body: UpdateCaseBody }),
  asyncHandler(c.updateCase),
);
opdRouter.post(
  '/cases/:id/close',
  requireAuth,
  mod,
  caseCap,
  requirePermission(PERMISSIONS.CASE_MANAGE),
  validate({ body: CloseCaseBody }),
  asyncHandler(c.closeCase),
);
opdRouter.post(
  '/cases/:id/reopen',
  requireAuth,
  mod,
  caseCap,
  requirePermission(PERMISSIONS.CASE_MANAGE),
  validate({ body: ReopenCaseBody }),
  asyncHandler(c.reopenCase),
);
