import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { requireAuth } from '../../http/requireAuth';
import { requireModule } from '../../http/requireModule';
import { requirePermission } from '../../http/requirePermission';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { CreateTestBody, EnterResultBody } from './laboratory.schema';
import * as c from './laboratory.controller';

// Laboratory — gated by the `laboratory` module entitlement. View/result = lab technician;
// test master + collection = LAB_MANAGE.
export const laboratoryRouter = Router();
const mod = requireModule('laboratory');

laboratoryRouter.get('/lab-tests', requireAuth, mod, requirePermission(PERMISSIONS.LAB_ORDER_VIEW), asyncHandler(c.listTests));
laboratoryRouter.post(
  '/lab-tests',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.LAB_MANAGE),
  validate({ body: CreateTestBody }),
  asyncHandler(c.createTest),
);
laboratoryRouter.get('/lab-orders', requireAuth, mod, requirePermission(PERMISSIONS.LAB_ORDER_VIEW), asyncHandler(c.worklist));
laboratoryRouter.get('/lab-orders/:id', requireAuth, mod, requirePermission(PERMISSIONS.LAB_ORDER_VIEW), asyncHandler(c.getOrder));
laboratoryRouter.post('/lab-orders/:id/collect', requireAuth, mod, requirePermission(PERMISSIONS.LAB_MANAGE), asyncHandler(c.collect));
laboratoryRouter.post(
  '/lab-orders/:id/result',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.LAB_RESULT_ENTER),
  validate({ body: EnterResultBody }),
  asyncHandler(c.enterResult),
);
// Sign off a resulted order — its own permission so a hospital can split enter/verify.
laboratoryRouter.post(
  '/lab-orders/:id/verify',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.LAB_RESULT_VERIFY),
  asyncHandler(c.verifyResult),
);
laboratoryRouter.get(
  '/lab-orders/:id/attachment',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.LAB_ORDER_VIEW),
  asyncHandler(c.reportAttachment),
);
