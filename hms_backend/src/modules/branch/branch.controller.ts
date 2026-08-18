import type { Request, Response } from 'express';
import * as svc from './branch.service';
import type { Branch } from '../../db/schema';

function toBranch(b: Branch) {
  return { id: b.id, code: b.code, name: b.name, isActive: b.isActive };
}

export async function listBranches(req: Request, res: Response): Promise<void> {
  const rows = await svc.listBranches(req.auth!.tenantId);
  res.json({ branches: rows.map(toBranch) });
}

export async function createBranch(req: Request, res: Response): Promise<void> {
  const b = await svc.createBranch(req.auth!.tenantId, req.body, req.auth!.userId);
  res.status(201).json(toBranch(b));
}

export async function updateBranch(req: Request, res: Response): Promise<void> {
  const b = await svc.updateBranch(req.auth!.tenantId, req.params.id!, req.body, req.auth!.userId);
  res.json(toBranch(b));
}
