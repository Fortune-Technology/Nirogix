import { Router } from 'express';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { LoginBody } from './auth.schema';
import * as controller from './auth.controller';

// Mounted at /api/v1 → routes are /api/v1/auth/*. Every route is documented in ./auth.openapi.ts
// (mandatory — resources/rules.md → API Documentation Rules).
export const authRouter = Router();

authRouter.post('/auth/login', validate({ body: LoginBody }), asyncHandler(controller.postLogin));
authRouter.post('/auth/refresh', asyncHandler(controller.postRefresh));
authRouter.post('/auth/logout', asyncHandler(controller.postLogout));
authRouter.get('/auth/me', requireAuth, asyncHandler(controller.getMe));
