import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { requireAuth } from '../../http/requireAuth';
import { requirePermission } from '../../http/requirePermission';
import { asyncHandler } from '../../http/asyncHandler';
import * as c from './reports.controller';
import { expensiveLimiter } from '../../http/rateLimit';

// Basic reports — cross-cutting (no single module gate, like the dashboard). Gated by
// REPORTS_VIEW; data is tenant-scoped through RLS.
export const reportsRouter = Router();

reportsRouter.get('/reports/opd-register', requireAuth, expensiveLimiter, requirePermission(PERMISSIONS.REPORTS_VIEW), asyncHandler(c.opdRegister));
reportsRouter.get('/reports/collections', requireAuth, expensiveLimiter, requirePermission(PERMISSIONS.REPORTS_VIEW), asyncHandler(c.collections));
reportsRouter.get('/reports/pending-labs', requireAuth, expensiveLimiter, requirePermission(PERMISSIONS.REPORTS_VIEW), asyncHandler(c.pendingLabs));
