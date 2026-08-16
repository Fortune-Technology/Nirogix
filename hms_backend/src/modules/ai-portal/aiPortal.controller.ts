import type { Request, Response } from 'express';
import * as svc from './aiPortal.service';

export async function enter(req: Request, res: Response): Promise<void> {
  res.json(await svc.enterAiPortal(req.auth!.tenantId, req.auth!.userId));
}
