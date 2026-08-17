import type { Request, Response } from 'express';
import * as svc from './laboratory.service';

export async function listTests(req: Request, res: Response): Promise<void> {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  res.json(await svc.listTests(req.auth!.tenantId, search));
}

export async function createTest(req: Request, res: Response): Promise<void> {
  res.status(201).json(await svc.createTest(req.auth!.tenantId, req.body, req.auth!.userId));
}

export async function worklist(req: Request, res: Response): Promise<void> {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
  res.json(await svc.listWorklist(req.auth!.tenantId, status, patientId));
}

export async function getOrder(req: Request, res: Response): Promise<void> {
  res.json(await svc.getLabOrder(req.auth!.tenantId, req.params.id!));
}

export async function collect(req: Request, res: Response): Promise<void> {
  res.json(await svc.collectSample(req.auth!.tenantId, req.params.id!, req.auth!.userId));
}

export async function enterResult(req: Request, res: Response): Promise<void> {
  res.json(await svc.enterResult(req.auth!.tenantId, req.params.id!, req.body, req.auth!.userId));
}

export async function verifyResult(req: Request, res: Response): Promise<void> {
  res.json(await svc.verifyResult(req.auth!.tenantId, req.params.id!, req.auth!.userId));
}

export async function reportAttachment(req: Request, res: Response): Promise<void> {
  const url = await svc.getReportAttachmentUrl(req.auth!.tenantId, req.params.id!);
  res.json({ url });
}
