import type { Request, Response } from 'express';
import * as svc from './emr.service';

// Open (or resume) the consultation for a visit — creates a draft encounter if none exists.
export async function openEncounter(req: Request, res: Response): Promise<void> {
  res.json(await svc.getEncounterByVisit(req.auth!.tenantId, req.body.visitId, req.auth!.userId));
}

export async function saveEncounter(req: Request, res: Response): Promise<void> {
  res.json(await svc.saveEncounter(req.auth!.tenantId, req.params.id!, req.body, req.auth!.userId));
}

export async function signEncounter(req: Request, res: Response): Promise<void> {
  res.json(await svc.signEncounter(req.auth!.tenantId, req.params.id!, req.auth!.userId));
}

export async function searchIcd10(req: Request, res: Response): Promise<void> {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  res.json(svc.searchIcd10(q));
}
