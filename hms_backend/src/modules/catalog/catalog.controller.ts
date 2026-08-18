import type { Request, Response } from 'express';
import * as svc from './catalog.service';
import * as avail from './branchAvailability.service';

export async function list(req: Request, res: Response): Promise<void> {
  const category = req.params.category as svc.CatalogCategory;
  const search = typeof req.query.q === 'string' ? req.query.q : undefined;
  const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  res.json(await svc.listCatalog(req.auth!.tenantId, category, search, branchId));
}

export async function createCustomVaccine(req: Request, res: Response): Promise<void> {
  const item = await svc.createCustomItem(req.auth!.tenantId, 'vaccine', req.body, req.auth!.userId);
  res.status(201).json(item);
}

export async function listAvailability(req: Request, res: Response): Promise<void> {
  const branchId = String(req.query.branchId);
  const itemType = req.query.itemType as avail.AvailabilityItemType | undefined;
  res.json(await avail.listOverrides(req.auth!.tenantId, branchId, itemType));
}

export async function setAvailability(req: Request, res: Response): Promise<void> {
  res.json(await avail.setAvailability(req.auth!.tenantId, req.body, req.auth!.userId));
}

export async function listAvailabilityItems(req: Request, res: Response): Promise<void> {
  const branchId = String(req.query.branchId);
  const itemType = req.query.itemType as avail.AvailabilityItemType;
  res.json(await svc.listItemsForAvailability(req.auth!.tenantId, branchId, itemType));
}
