import type { Request, Response } from 'express';
import { listEntitledModules } from './entitlement.service';

export async function listMyEntitlements(req: Request, res: Response): Promise<void> {
  const modules = await listEntitledModules(req.auth!.tenantId);
  res.json({ modules: Array.from(modules).sort() });
}

// Placeholder handlers for the demonstrator routes (replaced by the real modules later).
export async function patientsStub(_req: Request, res: Response): Promise<void> {
  res.json({ ok: true, module: 'patient', note: 'Patient module stub — full CRUD arrives in milestone 1.1' });
}

export async function ipdStub(_req: Request, res: Response): Promise<void> {
  res.json({ ok: true, module: 'ipd', note: 'IPD module stub' });
}
