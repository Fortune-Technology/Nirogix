import type { Request, Response } from 'express';
import { getOrgSummary } from './dashboard.service';

export async function getSummary(req: Request, res: Response): Promise<void> {
  res.json(await getOrgSummary(req.auth!.tenantId));
}
