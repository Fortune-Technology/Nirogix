import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requirePermission } from '../../http/requirePermission';
import * as controller from './rbac.controller';

export const rbacRouter = Router();

// Any authenticated user can read their own effective permissions.
rbacRouter.get('/rbac/permissions', requireAuth, asyncHandler(controller.getMyPermissions));

// Listing roles requires platform.roles.view — demonstrates requirePermission enforcement in
// both directions (an org_admin passes; a receptionist gets 403).
rbacRouter.get(
  '/rbac/roles',
  requireAuth,
  requirePermission(PERMISSIONS.ROLES_VIEW),
  asyncHandler(controller.listRoles),
);
