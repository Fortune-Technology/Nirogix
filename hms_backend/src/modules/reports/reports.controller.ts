import type { Request, Response } from 'express';
import * as svc from './reports.service';

function range(req: Request): { from: string; to: string } {
  const today = new Date().toISOString().slice(0, 10);
  const from = typeof req.query.from === 'string' && req.query.from ? req.query.from : today;
  const to = typeof req.query.to === 'string' && req.query.to ? req.query.to : today;
  return { from, to };
}

export async function opdRegister(req: Request, res: Response): Promise<void> {
  const { from, to } = range(req);
  res.json(await svc.opdRegister(req.auth!.tenantId, from, to));
}

export async function collections(req: Request, res: Response): Promise<void> {
  const { from, to } = range(req);
  res.json(await svc.collections(req.auth!.tenantId, from, to));
}

export async function pendingLabs(req: Request, res: Response): Promise<void> {
  res.json(await svc.pendingLabs(req.auth!.tenantId));
}
