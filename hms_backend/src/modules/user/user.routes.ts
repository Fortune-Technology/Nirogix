import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requirePermission } from '../../http/requirePermission';
import { CreateUserBody, UpdateUserBody, AssignRoleBody, SetOverrideBody } from './user.schema';
import * as c from './user.controller';

// Org-Admin surface — user accounts + their roles/overrides, tenant-scoped (requireAuth sets the
// tenant from the session; every query runs under RLS). Reads: platform.users.view; account
// mutations: platform.users.manage; role/override mutations: platform.rbac.manage.
export const userRouter = Router();

userRouter.get('/users', requireAuth, requirePermission(PERMISSIONS.USERS_VIEW), asyncHandler(c.listUsers));
userRouter.post(
  '/users',
  requireAuth,
  requirePermission(PERMISSIONS.USERS_MANAGE),
  validate({ body: CreateUserBody }),
  asyncHandler(c.createUser),
);
userRouter.get('/users/:id', requireAuth, requirePermission(PERMISSIONS.USERS_VIEW), asyncHandler(c.getUser));
userRouter.patch(
  '/users/:id',
  requireAuth,
  requirePermission(PERMISSIONS.USERS_MANAGE),
  validate({ body: UpdateUserBody }),
  asyncHandler(c.updateUser),
);

userRouter.post(
  '/users/:id/roles',
  requireAuth,
  requirePermission(PERMISSIONS.RBAC_MANAGE),
  validate({ body: AssignRoleBody }),
  asyncHandler(c.assignRole),
);
userRouter.delete(
  '/users/:id/roles/:roleKey',
  requireAuth,
  requirePermission(PERMISSIONS.RBAC_MANAGE),
  asyncHandler(c.removeRole),
);

userRouter.post(
  '/users/:id/overrides',
  requireAuth,
  requirePermission(PERMISSIONS.RBAC_MANAGE),
  validate({ body: SetOverrideBody }),
  asyncHandler(c.addOverride),
);
userRouter.delete(
  '/users/:id/overrides/:overrideId',
  requireAuth,
  requirePermission(PERMISSIONS.RBAC_MANAGE),
  asyncHandler(c.removeOverride),
);
