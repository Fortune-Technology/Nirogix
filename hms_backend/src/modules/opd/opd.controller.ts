import type { Request, Response } from 'express';
import { ListVisitsQuery } from './opd.schema';
import * as svc from './opd.service';

export async function listQueue(req: Request, res: Response): Promise<void> {
  const q = ListVisitsQuery.parse(req.query);
  res.json(await svc.listQueue(req.auth!.tenantId, q));
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
