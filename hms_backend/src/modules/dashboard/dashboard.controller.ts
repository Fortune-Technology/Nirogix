import type { Request, Response } from 'express';
import { getOrgSummary } from './dashboard.service';
import { getDashboardOverview } from './overview.service';

export async function getSummary(req: Request, res: Response): Promise<void> {
  res.json(await getOrgSummary(req.auth!.tenantId));
}

// The operational overview behind every role dashboard (ADR-044). RLS-scoped to the
// caller's own tenant; the window is clamped so one request cannot ask for a huge scan.
export async function getOverview(req: Request, res: Response): Promise<void> {
  const raw = Number(req.query.days ?? 14);
  const days = Number.isFinite(raw) ? Math.min(90, Math.max(7, Math.trunc(raw))) : 14;
  res.json(await getDashboardOverview(req.auth!.tenantId, days));
}
