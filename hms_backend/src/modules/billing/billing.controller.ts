import type { Request, Response } from 'express';
import { paginate } from '../../http/respond';
import * as feeSvc from './feeRules.service';
import { ListFeeRulesQuery, PreviewFeeQuery } from './feeRules.schema';
import { ListInvoicesQuery } from './billing.schema';
import * as svc from './billing.service';

export async function listInvoices(req: Request, res: Response): Promise<void> {
  const q = ListInvoicesQuery.parse(req.query);
  const { rows, total } = await svc.listInvoices(req.auth!.tenantId, q);
  res.json(paginate(rows, total, q.page, q.pageSize));
}

export async function getInvoice(req: Request, res: Response): Promise<void> {
  res.json(await svc.getInvoice(req.auth!.tenantId, req.params.id!));
}

export async function createInvoice(req: Request, res: Response): Promise<void> {
  res.status(201).json(await svc.createInvoice(req.auth!.tenantId, req.body, req.auth!.userId));
}

export async function recordPayment(req: Request, res: Response): Promise<void> {
  res.status(201).json(await svc.recordPayment(req.auth!.tenantId, req.params.id!, req.body, req.auth!.userId));
}

export async function addLine(req: Request, res: Response): Promise<void> {
  res.status(201).json(await svc.addServiceLine(req.auth!.tenantId, req.params.id!, req.body, req.auth!.userId));
}

export async function listServices(req: Request, res: Response): Promise<void> {
  const activeOnly = req.query.activeOnly === 'true';
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  res.json(await svc.listServices(req.auth!.tenantId, { activeOnly, search, branchId }));
}

export async function createService(req: Request, res: Response): Promise<void> {
  res.status(201).json(await svc.createService(req.auth!.tenantId, req.body, req.auth!.userId));
}

export async function updateService(req: Request, res: Response): Promise<void> {
  res.json(await svc.updateService(req.auth!.tenantId, req.params.id!, req.body, req.auth!.userId));
}

// ---- Consultation fee schedule (ADR-117) -----------------------------------

export async function listFeeRules(req: Request, res: Response): Promise<void> {
  const q = ListFeeRulesQuery.parse(req.query);
  res.json(await feeSvc.listFeeRules(req.auth!.tenantId, { includeInactive: q.includeInactive }));
}

export async function createFeeRule(req: Request, res: Response): Promise<void> {
  res.status(201).json(await feeSvc.createFeeRule(req.auth!.tenantId, req.body, req.auth!.userId));
}

export async function updateFeeRule(req: Request, res: Response): Promise<void> {
  res.json(await feeSvc.updateFeeRule(req.auth!.tenantId, req.params.id!, req.body, req.auth!.userId));
}

/** What check-in is about to charge, so the desk can quote it as it picks the doctor. */
export async function previewFee(req: Request, res: Response): Promise<void> {
  const q = PreviewFeeQuery.parse(req.query);
  res.json(await feeSvc.previewFee(req.auth!.tenantId, q));
}
