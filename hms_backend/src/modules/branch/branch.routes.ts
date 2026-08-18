import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requirePermission } from '../../http/requirePermission';
import { CreateBranchBody, UpdateBranchBody } from './branch.schema';
import * as c from './branch.controller';

// Org-Admin surface — branch management (tenant-scoped). Reads: platform.branches.view;
// mutations: platform.branches.manage.
export const branchRouter = Router();

branchRouter.get(
  '/branches',
  requireAuth,
  requirePermission(PERMISSIONS.BRANCHES_VIEW),
  asyncHandler(c.listBranches),
);
branchRouter.post(
  '/branches',
  requireAuth,
  requirePermission(PERMISSIONS.BRANCHES_MANAGE),
  validate({ body: CreateBranchBody }),
  asyncHandler(c.createBranch),
);
branchRouter.patch(
  '/branches/:id',
  requireAuth,
  requirePermission(PERMISSIONS.BRANCHES_MANAGE),
  validate({ body: UpdateBranchBody }),
  asyncHandler(c.updateBranch),
);
