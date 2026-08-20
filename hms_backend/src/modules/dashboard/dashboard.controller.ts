import type { Request, Response } from 'express';
import { getOrgSummary } from './dashboard.service';
import { getDashboardOverview, type OverviewRange } from './overview.service';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function getSummary(req: Request, res: Response): Promise<void> {
  res.json(await getOrgSummary(req.auth!.tenantId));
}

/**
 * The window a request asked for. An explicit inclusive `from`/`to` (ISO, `to >= from`)
 * is honoured — that is how the shared period filter drives calendar presets such as
 * "This month" or "Last financial year"; otherwise the legacy rolling `days` count is
 * used (default 14, clamped 7–90). The service caps the day span so neither path can
 * force an unbounded scan.
 */
function overviewRange(q: Request['query']): OverviewRange {
  const from = typeof q.from === 'string' && ISO_DATE.test(q.from) ? q.from : null;
  const to = typeof q.to === 'string' && ISO_DATE.test(q.to) ? q.to : null;
  if (from && to && to >= from) return { from, to };
  const raw = Number(q.days ?? 14);
  return Number.isFinite(raw) ? Math.min(90, Math.max(7, Math.trunc(raw))) : 14;
}

// The operational overview behind every role dashboard (ADR-044). RLS-scoped to the
// caller's own tenant; the window is clamped so one request cannot ask for a huge scan.
export async function getOverview(req: Request, res: Response): Promise<void> {
  res.json(await getDashboardOverview(req.auth!.tenantId, overviewRange(req.query)));
}
