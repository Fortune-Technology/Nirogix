import type { Request, Response } from 'express';
import * as svc from './immunization.service';

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await svc.listImmunizations(req.auth!.tenantId, req.params.patientId!));
}

export async function record(req: Request, res: Response): Promise<void> {
  res
    .status(201)
    .json(
      await svc.addImmunization(
        req.auth!.tenantId,
        req.params.patientId!,
        req.body,
        req.auth!.userId,
      ),
    );
}
