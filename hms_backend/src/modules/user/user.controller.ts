import type { Request, Response } from 'express';
import { Errors } from '../../http/error';
import * as svc from './user.service';
import { MESSAGES } from '../notification/messages';
import {
  assignRoleByKey,
  removeRoleByKey,
  setOverride,
  revokeOverride,
} from '../rbac/rbac.service';

export async function listUsers(req: Request, res: Response): Promise<void> {
  res.json({ users: await svc.listUsers(req.auth!.tenantId) });
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const { userId, tempPassword } = await svc.createUser(
    req.auth!.tenantId,
    req.body,
    req.auth!.userId,
  );
  res.status(201).json({ id: userId, tempPassword, message: MESSAGES.user.created });
}

export async function getUser(req: Request, res: Response): Promise<void> {
  const d = await svc.getUserDetail(req.auth!.tenantId, req.params.id!);
  if (!d) throw Errors.notFound('User not found');
  res.json({
    id: d.user.id,
    email: d.user.email,
    fullName: d.user.fullName,
    status: d.user.status,
    mfaEnabled: d.user.mfaEnabled,
    roles: d.roles,
    wildcard: d.wildcard,
    permissions: d.permissions,
    overrides: d.overrides,
  });
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const u = await svc.updateUser(req.auth!.tenantId, req.params.id!, req.body, req.auth!.userId);
  res.json({ id: u.id, email: u.email, fullName: u.fullName, status: u.status });
}

export async function assignRole(req: Request, res: Response): Promise<void> {
  await assignRoleByKey(req.auth!.tenantId, req.params.id!, req.body.roleKey);
  res.status(201).json({ ok: true });
}

export async function removeRole(req: Request, res: Response): Promise<void> {
  await removeRoleByKey(req.auth!.tenantId, req.params.id!, req.params.roleKey!);
  res.json({ ok: true });
}

export async function addOverride(req: Request, res: Response): Promise<void> {
  await setOverride(req.auth!.tenantId, {
    userId: req.params.id!,
    permission: req.body.permission,
    effect: req.body.effect,
    validUntil: req.body.validUntil ? new Date(req.body.validUntil) : null,
    reason: req.body.reason,
    createdBy: req.auth!.userId,
  });
  res.status(201).json({ ok: true });
}

export async function removeOverride(req: Request, res: Response): Promise<void> {
  await revokeOverride(req.auth!.tenantId, req.params.overrideId!, req.params.id!);
  res.json({ ok: true });
}
