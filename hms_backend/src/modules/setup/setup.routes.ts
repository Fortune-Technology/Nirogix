import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requirePermission } from '../../http/requirePermission';
import * as c from './setup.controller';

/**
 * Hospital Setup status (ADR-049). Gated by `platform.organization.manage` rather than left
 * open: the response is a roll-up of how many staff, providers and branches a hospital has,
 * which is administrative information, not something every receptionist needs.
 */
export const setupRouter = Router();

setupRouter.get(
  '/setup/status',
  requireAuth,
  requirePermission(PERMISSIONS.ORG_PROFILE_MANAGE),
  asyncHandler(c.getStatus),
);
