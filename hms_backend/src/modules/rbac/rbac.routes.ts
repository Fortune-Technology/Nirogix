import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requirePermission } from '../../http/requirePermission';
import { validate } from '../../http/validate';
import { AccessExplainQuerySchema } from './rbac.schema';
import * as controller from './rbac.controller';

export const rbacRouter = Router();

// Any authenticated user can read their own effective permissions.
rbacRouter.get('/rbac/permissions', requireAuth, asyncHandler(controller.getMyPermissions));

// Why a refusal happened, for the screen that has to explain it (ADR-126). Authenticated only:
// it describes the caller's own hospital — which roles exist and what each may do — and carries no
// patient data, no other tenant and no account.
rbacRouter.get(
  '/rbac/access',
  requireAuth,
  validate({ query: AccessExplainQuerySchema }),
  asyncHandler(controller.explainAccess),
);

// Listing roles requires platform.roles.view — demonstrates requirePermission enforcement in
// both directions (an org_admin passes; a receptionist gets 403).
rbacRouter.get(
  '/rbac/roles',
  requireAuth,
  requirePermission(PERMISSIONS.ROLES_VIEW),
  asyncHandler(controller.listRoles),
);
