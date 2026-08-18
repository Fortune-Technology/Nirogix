import type { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { ListVisitsQuery } from './opd.schema';
import * as svc from './opd.service';
import { runWithTenant } from '../../db/tenantContext';
import { providers } from '../../db/schema';

export async function listQueue(req: Request, res: Response): Promise<void> {
  const q = ListVisitsQuery.parse(req.query);
  let providerId = q.providerId;
  // `mine=true` — a doctor's own worklist: resolve the provider linked to this login. A user
  // with no provider record has no personal queue (empty list, not everyone else's patients).
  if (q.mine === 'true') {
    const own = await runWithTenant(req.auth!.tenantId, async (tx) =>
      (
        await tx
          .select({ id: providers.id })
          .from(providers)
          .where(and(eq(providers.tenantId, req.auth!.tenantId), eq(providers.userId, req.auth!.userId)))
          .limit(1)
      )[0],
    );
    if (!own) {
      res.json([]);
      return;
    }
    providerId = own.id;
  }
  res.json(await svc.listQueue(req.auth!.tenantId, { ...q, providerId }));
}

export async function getVisit(req: Request, res: Response): Promise<void> {
  res.json(await svc.getVisit(req.auth!.tenantId, req.params.id!));
}

export async function checkIn(req: Request, res: Response): Promise<void> {
  res.status(201).json(await svc.checkIn(req.auth!.tenantId, req.body, req.auth!.userId));
}

export async function updateStatus(req: Request, res: Response): Promise<void> {
  res.json(await svc.updateStatus(req.auth!.tenantId, req.params.id!, req.body.status, req.body.version, req.auth!.userId));
}
