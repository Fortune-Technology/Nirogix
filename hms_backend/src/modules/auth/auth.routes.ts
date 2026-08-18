import { Router } from 'express';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { LoginBody } from './auth.schema';
import * as controller from './auth.controller';
import { authLimiter, sensitiveLimiter } from '../../http/rateLimit';

// Mounted at /api/v1 → routes are /api/v1/auth/*. Every route is documented in ./auth.openapi.ts
// (mandatory — resources/rules.md → API Documentation Rules).
export const authRouter = Router();

authRouter.post('/auth/login', authLimiter, validate({ body: LoginBody }), asyncHandler(controller.postLogin));
authRouter.post('/auth/refresh', authLimiter, asyncHandler(controller.postRefresh));
authRouter.post('/auth/logout', asyncHandler(controller.postLogout));
authRouter.get('/auth/me', requireAuth, asyncHandler(controller.getMe));
// Self-service: the caller can only ever act on their own account (userId comes
// from the verified token, never the body).
authRouter.patch('/auth/profile', requireAuth, sensitiveLimiter, asyncHandler(controller.patchProfile));
authRouter.post('/auth/change-password', requireAuth, sensitiveLimiter, asyncHandler(controller.postChangePassword));
