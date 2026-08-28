import type { Request, Response } from 'express';
import { listEntitledModules } from './entitlement.service';
import { listEntitledCapabilities } from './capability.service';

// The authenticated user's entitled modules AND enabled capabilities (ADR-085) — the two-tier
// context the frontend consumes for module-/capability-aware nav and gating. Frontend hiding is
// never security; every route still re-checks server-side (requireModule → requireCapability).
export async function listMyEntitlements(req: Request, res: Response): Promise<void> {
  const [modules, capabilities] = await Promise.all([
    listEntitledModules(req.auth!.tenantId),
    listEntitledCapabilities(req.auth!.tenantId),
  ]);
  res.json({ modules: Array.from(modules).sort(), capabilities });
}

// Placeholder handler for the IPD demonstrator route (real IPD module arrives in Phase 2).
export async function ipdStub(_req: Request, res: Response): Promise<void> {
  res.json({ ok: true, module: 'ipd', note: 'IPD module stub' });
}
