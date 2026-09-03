import type { Request, Response } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { hasPermission, resolvePermissions } from '../rbac/rbac.service';
import * as svc from './selfCheckin.service';

/**
 * The public half answers **identically in every case** (ADR-118). A response that varied would
 * turn this endpoint into an oracle answering "is this mobile number a patient here, and are they
 * due in today?" for anyone holding the QR code — a disclosure about a named person's medical
 * attendance, to a caller who proved nothing.
 */
const UNIFORM_REPLY = {
  message: 'Thanks. If you have an appointment today, the front desk has been told you are here.',
};

export async function publicContext(req: Request, res: Response): Promise<void> {
  const { ctx } = await svc.resolveCheckinToken(req.params.token!);
  res.json(ctx);
}

export async function publicAnnounce(req: Request, res: Response): Promise<void> {
  const { tenantId, ctx } = await svc.resolveCheckinToken(req.params.token!);
  await svc.announceArrival(
    tenantId,
    { phone: req.body.phone, enabled: ctx.enabled },
    { ip: req.ip, userAgent: req.get('user-agent') ?? undefined },
  );
  res.status(202).json(UNIFORM_REPLY);
}

// ---- Hospital side ---------------------------------------------------------

export async function listArrivals(req: Request, res: Response): Promise<void> {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json(await svc.listArrivals(req.auth!.tenantId, { status }));
}

export async function confirmArrival(req: Request, res: Response): Promise<void> {
  // Confirming runs the ordinary check-in, which may need to price the visit; whether this user
  // could override that price is resolved here, from the session, exactly as it is on check-in.
  const resolved = await resolvePermissions(req.auth!.tenantId, req.auth!.userId);
  const canOverrideFee = hasPermission(resolved, PERMISSIONS.BILLING_FEE_OVERRIDE);
  res.json(
    await svc.confirmArrival(
      req.auth!.tenantId,
      req.params.id!,
      { version: req.body.version, canOverrideFee },
      req.auth!.userId,
    ),
  );
}

export async function dismissArrival(req: Request, res: Response): Promise<void> {
  res.json(
    await svc.dismissArrival(req.auth!.tenantId, req.params.id!, req.body, req.auth!.userId),
  );
}

// ---- Hospital configuration -------------------------------------------------

export async function getSettings(req: Request, res: Response): Promise<void> {
  res.json(await svc.getSettings(req.auth!.tenantId));
}

export async function setEnabled(req: Request, res: Response): Promise<void> {
  res.json(await svc.setEnabled(req.auth!.tenantId, req.body.enabled, req.auth!.userId));
}

export async function regenerate(req: Request, res: Response): Promise<void> {
  res.json(await svc.regenerateToken(req.auth!.tenantId, req.auth!.userId));
}
