import type { Request, Response } from 'express';
import * as config from './workflowConfig.service';
import * as vitals from './vitals.service';
import { WorkflowConfigQuery, VitalsQueueQuery } from './workflow.schema';

export async function getWorkflowConfig(req: Request, res: Response): Promise<void> {
  const q = WorkflowConfigQuery.parse(req.query);
  res.json(await config.getConfig(req.auth!.tenantId, q.branchId ?? null));
}

export async function updateWorkflowConfig(req: Request, res: Response): Promise<void> {
  const q = WorkflowConfigQuery.parse(req.query);
  res.json(
    await config.updateConfig(req.auth!.tenantId, q.branchId ?? null, req.body, req.auth!.userId),
  );
}

export async function recordVitals(req: Request, res: Response): Promise<void> {
  res.status(201).json(await vitals.recordVitals(req.auth!.tenantId, req.body, req.auth!.userId));
}

export async function listVisitVitals(req: Request, res: Response): Promise<void> {
  res.json(await vitals.listForVisit(req.auth!.tenantId, req.params.visitId!));
}

export async function listVitalsQueue(req: Request, res: Response): Promise<void> {
  const q = VitalsQueueQuery.parse(req.query);
  res.json(
    await vitals.listVitalsQueue(req.auth!.tenantId, {
      branchId: q.branchId ?? null,
      pending: q.pending,
    }),
  );
}
