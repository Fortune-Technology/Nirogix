import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requirePermission } from '../../http/requirePermission';
import * as controller from './audit.controller';

export const auditRouter = Router();

// Viewing the audit trail requires audit.log.view. Restricting who can read the audit log is
// itself part of the security model.
auditRouter.get(
  '/audit',
  requireAuth,
  requirePermission(PERMISSIONS.AUDIT_VIEW),
  asyncHandler(controller.listAuditLog),
);
