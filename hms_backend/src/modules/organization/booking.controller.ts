import type { Request, Response } from 'express';
import * as svc from './booking.service';

// ---- Public (unauthenticated) ----------------------------------------------

export async function publicContext(req: Request, res: Response): Promise<void> {
  const { ctx } = await svc.resolveBookingToken(req.params.token!);
  res.json(ctx);
}

export async function publicSubmit(req: Request, res: Response): Promise<void> {
  await svc.submitBookingRequest(req.params.token!, req.body, { ip: req.ip });
  // Uniform, and promises nothing about the slot — the desk confirms it.
  res.status(202).json({ message: 'Thanks. The hospital will confirm your appointment.' });
}

// ---- Hospital side ---------------------------------------------------------

export async function listRequests(req: Request, res: Response): Promise<void> {
  const status = (req.query.status as string) || 'pending';
  res.json({ requests: await svc.listBookingRequests(req.auth!.tenantId, status) });
}

export async function approve(req: Request, res: Response): Promise<void> {
  res.json(await svc.approveBookingRequest(req.auth!.tenantId, req.params.id!, req.body, req.auth!.userId));
}

export async function reject(req: Request, res: Response): Promise<void> {
  await svc.rejectBookingRequest(req.auth!.tenantId, req.params.id!, req.body?.reason, req.auth!.userId);
  res.status(204).end();
}

export async function getSettings(req: Request, res: Response): Promise<void> {
  res.json(await svc.getBookingSettings(req.auth!.tenantId));
}

export async function setEnabled(req: Request, res: Response): Promise<void> {
  res.json(await svc.setOnlineBooking(req.auth!.tenantId, req.body.enabled, req.auth!.userId));
}

export async function regenerate(req: Request, res: Response): Promise<void> {
  res.json(await svc.regenerateBookingToken(req.auth!.tenantId, req.auth!.userId));
}
