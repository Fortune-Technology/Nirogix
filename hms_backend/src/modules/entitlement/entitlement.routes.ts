import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requireModule } from '../../http/requireModule';
import { requirePermission } from '../../http/requirePermission';
import * as controller from './entitlement.controller';

export const entitlementRouter = Router();

// The authenticated user's entitled modules — drives the frontend capabilities context.
entitlementRouter.get('/entitlements', requireAuth, asyncHandler(controller.listMyEntitlements));

// Demonstrators of the full authz chain (auth → module → permission). Placeholders until the
// real Patient (milestone 1.1) and IPD (Phase 2) modules are built.
entitlementRouter.get(
  '/patients',
  requireAuth,
  requireModule('patient'),
  requirePermission(PERMISSIONS.PATIENT_VIEW),
  asyncHandler(controller.patientsStub),
);
entitlementRouter.get(
  '/ipd/beds',
  requireAuth,
  requireModule('ipd'),
  asyncHandler(controller.ipdStub),
);
