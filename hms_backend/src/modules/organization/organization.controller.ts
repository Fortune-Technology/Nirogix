import type { Request, Response } from 'express';
import * as svc from './organization.service';

export async function getProfile(req: Request, res: Response): Promise<void> {
  res.json(await svc.getOrganizationProfile(req.auth!.tenantId));
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  res.json(await svc.updateOrganizationProfile(req.auth!.tenantId, req.body, req.auth!.userId));
}
