import type { Request, Response } from 'express';
import { paginate } from '../../http/respond';
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
