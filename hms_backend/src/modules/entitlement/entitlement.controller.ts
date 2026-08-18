import type { Request, Response } from 'express';
import { listEntitledModules } from './entitlement.service';

export async function listMyEntitlements(req: Request, res: Response): Promise<void> {
  const modules = await listEntitledModules(req.auth!.tenantId);
  res.json({ modules: Array.from(modules).sort() });
}

// Placeholder handler for the IPD demonstrator route (real IPD module arrives in Phase 2).
export async function ipdStub(_req: Request, res: Response): Promise<void> {
  res.json({ ok: true, module: 'ipd', note: 'IPD module stub' });
}
