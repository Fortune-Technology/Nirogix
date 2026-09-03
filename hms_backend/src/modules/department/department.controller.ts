import type { Request, Response } from 'express';
import * as svc from './department.service';

export async function list(req: Request, res: Response): Promise<void> {
  const { activeOnly, branchId } = req.query as { activeOnly?: boolean; branchId?: string };
  res.json({
    departments: await svc.listDepartments(req.auth!.tenantId, { activeOnly, branchId }),
  });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  res.json(await svc.getDepartment(req.auth!.tenantId, req.params.id!));
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json(await svc.createDepartment(req.auth!.tenantId, req.body, req.auth!.userId));
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json(
    await svc.updateDepartment(req.auth!.tenantId, req.params.id!, req.body, req.auth!.userId),
  );
}
