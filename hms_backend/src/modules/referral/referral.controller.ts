import type { Request, Response } from 'express';
import { ListReferralsQuery } from './referral.schema';
import * as svc from './referral.service';

export async function createReferral(req: Request, res: Response): Promise<void> {
  res.status(201).json(await svc.createReferral(req.auth!.tenantId, req.body, req.auth!.userId));
}

export async function listReferrals(req: Request, res: Response): Promise<void> {
  const q = ListReferralsQuery.parse(req.query);
  res.json(await svc.listReferrals(req.auth!.tenantId, q));
}

export async function cancelReferral(req: Request, res: Response): Promise<void> {
  res.json(await svc.cancelReferral(req.auth!.tenantId, req.params.id!, req.auth!.userId));
}
