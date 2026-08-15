import type { Request, Response } from 'express';
import { z } from '../../openapi/registry';
import { isProd } from '../../config/env';
import { Errors } from '../../http/error';
import { tokenExpiry } from './tokens';
import * as authService from './auth.service';

const REFRESH_COOKIE = 'hms_refresh';
// Scope the refresh cookie to the auth routes so it is only sent where it's needed.
const REFRESH_PATH = '/api/v1/auth';

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd, // localhost dev is http; production is https
    sameSite: 'lax',
    path: REFRESH_PATH,
    maxAge: Math.max(0, tokenExpiry(token).getTime() - Date.now()),
  });
}

function clientMeta(req: Request) {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

export async function postLogin(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body, clientMeta(req));
  if (result.status === 'mfa_required') {
    res.json({ mfaRequired: true });
    return;
  }
  setRefreshCookie(res, result.refreshToken);
  res.json({ accessToken: result.accessToken, user: result.user });
}

export async function postRefresh(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw Errors.unauthorized('No session');
  const { accessToken, refreshToken } = await authService.refresh(token, clientMeta(req));
  setRefreshCookie(res, refreshToken);
  res.json({ accessToken });
}

export async function postLogout(req: Request, res: Response): Promise<void> {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
  res.json({ message: 'Logged out' });
}

export async function getMe(req: Request, res: Response): Promise<void> {
  // requireAuth guarantees req.auth is set.
  const { tenantId, userId, roles } = req.auth!;
  const user = await authService.getUserById(tenantId, userId);
  if (!user) throw Errors.unauthorized('Session no longer valid');
  // Roles come from the verified access token, so this costs no extra query.
  res.json({ user: { ...user, roles } });
}

const ProfilePatchSchema = z.object({
  fullName: z.string().trim().min(2).max(200),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  // Matches the strength the rest of the platform issues; upper bound guards bcrypt cost.
  newPassword: z.string().min(10).max(200),
});

export async function patchProfile(req: Request, res: Response): Promise<void> {
  const { tenantId, userId } = req.auth!;
  const patch = ProfilePatchSchema.parse(req.body);
  const user = await authService.updateOwnProfile(tenantId, userId, patch);
  res.json({ user, message: 'Profile updated.' });
}

export async function postChangePassword(req: Request, res: Response): Promise<void> {
  const { tenantId, userId } = req.auth!;
  const input = ChangePasswordSchema.parse(req.body);
  await authService.changeOwnPassword(tenantId, userId, input);
  res.json({ message: 'Password changed. Please sign in again.' });
}
