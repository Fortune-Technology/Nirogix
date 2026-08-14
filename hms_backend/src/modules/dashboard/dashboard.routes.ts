import { Router } from 'express';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import * as c from './dashboard.controller';

// Org-scoped dashboard summary — any authenticated user gets their OWN tenant's roll-up (RLS).
export const dashboardRouter = Router();

dashboardRouter.get('/dashboard/summary', requireAuth, asyncHandler(c.getSummary));
