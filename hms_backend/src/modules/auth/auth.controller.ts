import type { Request, Response } from 'express';
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
  const { tenantId, userId } = req.auth!;
  const user = await authService.getUserById(tenantId, userId);
  if (!user) throw Errors.unauthorized('Session no longer valid');
  res.json({ user });
}
