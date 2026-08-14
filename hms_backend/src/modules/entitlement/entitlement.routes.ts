import { Router } from 'express';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requireModule } from '../../http/requireModule';
import * as controller from './entitlement.controller';

export const entitlementRouter = Router();

// The authenticated user's entitled modules — drives the frontend capabilities context.
entitlementRouter.get('/entitlements', requireAuth, asyncHandler(controller.listMyEntitlements));

// Demonstrator of requireModule gating for a not-yet-built module (IPD is Phase 2): a tenant
// without the `ipd` entitlement gets 403 MODULE_NOT_ENTITLED. (The `/patients` demonstrator was
// replaced by the real Patient module — modules/patient.)
entitlementRouter.get(
  '/ipd/beds',
  requireAuth,
  requireModule('ipd'),
  asyncHandler(controller.ipdStub),
);
