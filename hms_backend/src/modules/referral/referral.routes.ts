import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { requireAuth } from '../../http/requireAuth';
import { requireModule } from '../../http/requireModule';
import { requirePermission } from '../../http/requirePermission';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { CreateReferralBody } from './referral.schema';
import * as c from './referral.controller';

// Referrals (ADR-068) ride the `opd` module — they are visit routing, not their own
// purchasable capability. Completing one happens through check-in, never directly.
export const referralRouter = Router();
const mod = requireModule('opd');

referralRouter.get(
  '/referrals',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.REFERRAL_VIEW),
  asyncHandler(c.listReferrals),
);
referralRouter.post(
  '/referrals',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.REFERRAL_CREATE),
  validate({ body: CreateReferralBody }),
  asyncHandler(c.createReferral),
);
referralRouter.post(
  '/referrals/:id/cancel',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.REFERRAL_UPDATE),
  asyncHandler(c.cancelReferral),
);
