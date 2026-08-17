import type { Request, Response } from 'express';
import * as svc from './pharmacy.service';

export async function listDrugs(req: Request, res: Response): Promise<void> {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  res.json(await svc.listDrugs(req.auth!.tenantId, search));
}

export async function createDrug(req: Request, res: Response): Promise<void> {
  res.status(201).json(await svc.createDrug(req.auth!.tenantId, req.body, req.auth!.userId));
}

export async function receiveStock(req: Request, res: Response): Promise<void> {
  res.status(201).json(await svc.receiveStock(req.auth!.tenantId, req.params.id!, req.body, req.auth!.userId));
}

export async function pendingPrescriptions(req: Request, res: Response): Promise<void> {
  res.json(await svc.listPendingPrescriptions(req.auth!.tenantId));
}

export async function dispense(req: Request, res: Response): Promise<void> {
  res.status(201).json(await svc.dispense(req.auth!.tenantId, req.body, req.auth!.userId));
}

export async function listSuppliers(req: Request, res: Response): Promise<void> {
  res.json(await svc.listSuppliers(req.auth!.tenantId));
}

export async function createSupplier(req: Request, res: Response): Promise<void> {
  res.status(201).json(await svc.createSupplier(req.auth!.tenantId, req.body, req.auth!.userId));
}

export async function updateSupplier(req: Request, res: Response): Promise<void> {
  res.json(await svc.updateSupplier(req.auth!.tenantId, req.params.id!, req.body, req.auth!.userId));
}

export async function adjustStock(req: Request, res: Response): Promise<void> {
  res.status(201).json(await svc.adjustStock(req.auth!.tenantId, req.params.id!, req.body, req.auth!.userId));
}

export async function listAdjustments(req: Request, res: Response): Promise<void> {
  const drugId = typeof req.query.drugId === 'string' ? req.query.drugId : undefined;
  res.json(await svc.listAdjustments(req.auth!.tenantId, drugId));
}
