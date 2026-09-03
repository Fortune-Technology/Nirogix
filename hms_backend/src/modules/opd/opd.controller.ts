import type { Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { ListVisitsQuery } from './opd.schema';
import { ListCasesQuery } from './case.schema';
import * as svc from './opd.service';
import * as caseSvc from './case.service';
import { PERMISSIONS } from '@hms/permissions';
import { hasPermission, resolvePermissions } from '../rbac/rbac.service';
import { runWithTenant } from '../../db/tenantContext';
import { providers } from '../../db/schema';

export async function listQueue(req: Request, res: Response): Promise<void> {
  const q = ListVisitsQuery.parse(req.query);
  let providerId = q.providerId;
  // `mine=true` — a doctor's own worklist: resolve the provider linked to this login. A user
  // with no provider record has no personal queue (empty list, not everyone else's patients).
  if (q.mine === 'true') {
    const own = await runWithTenant(
      req.auth!.tenantId,
      async (tx) =>
        (
          await tx
            .select({ id: providers.id })
            .from(providers)
            .where(
              and(
                eq(providers.tenantId, req.auth!.tenantId),
                eq(providers.userId, req.auth!.userId),
              ),
            )
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
  // Whether this user may charge other than the fee schedule is resolved from the session, never
  // taken from the body — a client asserting its own permission is not a permission (ADR-117).
  const resolved = await resolvePermissions(req.auth!.tenantId, req.auth!.userId);
  const canOverrideFee = hasPermission(resolved, PERMISSIONS.BILLING_FEE_OVERRIDE);
  res
    .status(201)
    .json(await svc.checkIn(req.auth!.tenantId, { ...req.body, canOverrideFee }, req.auth!.userId));
}

export async function updateStatus(req: Request, res: Response): Promise<void> {
  res.json(
    await svc.updateStatus(
      req.auth!.tenantId,
      req.params.id!,
      req.body.status,
      req.body.version,
      req.auth!.userId,
    ),
  );
}

// ---- Treatment cases (ADR-116) ---------------------------------------------

export async function listCases(req: Request, res: Response): Promise<void> {
  const q = ListCasesQuery.parse(req.query);
  res.json(await caseSvc.listCases(req.auth!.tenantId, q));
}

export async function getCase(req: Request, res: Response): Promise<void> {
  res.json(await caseSvc.getCase(req.auth!.tenantId, req.params.id!));
}

export async function openCase(req: Request, res: Response): Promise<void> {
  res.status(201).json(await caseSvc.openCase(req.auth!.tenantId, req.body, req.auth!.userId));
}

export async function updateCase(req: Request, res: Response): Promise<void> {
  res.json(
    await caseSvc.updateCase(req.auth!.tenantId, req.params.id!, req.body, req.auth!.userId),
  );
}

export async function closeCase(req: Request, res: Response): Promise<void> {
  res.json(await caseSvc.closeCase(req.auth!.tenantId, req.params.id!, req.body, req.auth!.userId));
}

export async function reopenCase(req: Request, res: Response): Promise<void> {
  res.json(
    await caseSvc.reopenCase(req.auth!.tenantId, req.params.id!, req.body, req.auth!.userId),
  );
}
