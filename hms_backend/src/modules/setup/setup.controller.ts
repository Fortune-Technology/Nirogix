import type { Request, Response } from 'express';
import * as svc from './setup.service';

export async function getStatus(req: Request, res: Response): Promise<void> {
  res.json(await svc.getSetupStatus(req.auth!.tenantId));
}
