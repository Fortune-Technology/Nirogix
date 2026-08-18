import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requirePermission } from '../../http/requirePermission';
import * as c from './aiPortal.controller';

/**
 * The AI Portal's one endpoint (ADR-053).
 *
 * Three refusals stack here, and each is deliberate:
 *
 * 1. **`requireAuth` refuses a patient by principal type** (ADR-052), before any
 *    permission is read. A patient must never reach the AI Portal, and refusing by type
 *    means that stays true even if someone later grants a patient a permission by
 *    mistake — the check does not depend on the permission set being empty.
 * 2. **`ai.portal.access` is held by no role by default.** An operator grants it to a
 *    named person deliberately. Nobody has it simply by being staff, or by being an
 *    administrator.
 * 3. **Entry is audited** at notice level, because a surface that would one day process
 *    clinical information needs "who opened it, and when" answerable from the start.
 *
 * There is no second endpoint because there is no AI capability. When one is scoped —
 * with the CDSCO classification check recorded first for anything touching diagnosis or
 * treatment — it is added behind this same gate.
 */
export const aiPortalRouter = Router();

aiPortalRouter.post(
  '/ai/portal/session',
  requireAuth,
  requirePermission(PERMISSIONS.AI_PORTAL_ACCESS),
  asyncHandler(c.enter),
);
