import type { Request, Response } from 'express';
import { z } from '../../openapi/registry';
import { isProd } from '../../config/env';
import { Errors } from '../../http/error';
import { tokenExpiry } from './tokens';
import * as authService from './auth.service';
import { writeAudit } from '../audit/audit.service';

import { REFRESH_COOKIE, REFRESH_PATH, setRefreshCookie } from './auth.cookie';

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
  const ended = await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });

  // Ending a support session is itself an audit event, written in the tenant the
  // operator was inside (ADR-037). Sourced from the revoked session row, because
  // this route is unauthenticated by design.
  if (ended?.impersonatedBy) {
    await writeAudit({
      tenantId: ended.tenantId,
      actorUserId: ended.impersonatedBy,
      action: 'support.session.end',
      severity: 'warning',
      resourceType: 'user',
      resourceId: ended.userId,
      metadata: { operatorUserId: ended.impersonatedBy },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  res.json({ message: ended?.impersonatedBy ? 'Support session ended.' : 'Logged out' });
}


export async function getMe(req: Request, res: Response): Promise<void> {
  // requireAuth guarantees req.auth is set.
  const { tenantId, userId, roles, impersonatedBy } = req.auth!;
  const user = await authService.getUserById(tenantId, userId);
  if (!user) throw Errors.unauthorized('Session no longer valid');
  // Roles come from the verified access token, so this costs no extra query.
  // `impersonatedBy` lets the Portal show the support-session banner after a reload.
  res.json({ user: { ...user, roles, impersonatedBy: impersonatedBy ?? null } });
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
