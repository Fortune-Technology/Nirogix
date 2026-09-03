import type { Request, Response } from 'express';
import * as svc from './registration.service';

// ---- Public (unauthenticated) ----------------------------------------------

export async function publicContext(req: Request, res: Response): Promise<void> {
  const { ctx } = await svc.resolveRegistrationToken(req.params.token!);
  res.json(ctx);
}

export async function publicSubmit(req: Request, res: Response): Promise<void> {
  await svc.submitRegistrationRequest(req.params.token!, req.body, { ip: req.ip });
  // Uniform, and says nothing about what happens next inside the hospital.
  res
    .status(202)
    .json({ message: 'Thanks. The hospital will confirm your registration at the desk.' });
}

// ---- Hospital side ---------------------------------------------------------

export async function listRequests(req: Request, res: Response): Promise<void> {
  const status = (req.query.status as string) || 'pending';
  const rows = await svc.listRegistrationRequests(req.auth!.tenantId, status);
  // Projected to the documented shape rather than spread from the row: `tenant_id`, the
  // submitter's IP and the reviewer's id are ours, not the client's, and spreading would
  // quietly ship whatever column the table gains next.
  res.json({
    requests: rows.map((r) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      gender: r.gender,
      dateOfBirth: r.dateOfBirth,
      phone: r.phone,
      email: r.email,
      city: r.city,
      note: r.note,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

export async function approve(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as { allowDuplicate?: boolean; existingPatientId?: string };
  res.json(
    await svc.approveRegistrationRequest(req.auth!.tenantId, req.params.id!, req.auth!.userId, {
      allowDuplicate: body.allowDuplicate,
      existingPatientId: body.existingPatientId,
    }),
  );
}

export async function reject(req: Request, res: Response): Promise<void> {
  await svc.rejectRegistrationRequest(
    req.auth!.tenantId,
    req.params.id!,
    req.body?.reason,
    req.auth!.userId,
  );
  res.status(204).end();
}

export async function getSettings(req: Request, res: Response): Promise<void> {
  res.json(await svc.getRegistrationSettings(req.auth!.tenantId));
}

export async function setEnabled(req: Request, res: Response): Promise<void> {
  res.json(await svc.setSelfRegistration(req.auth!.tenantId, req.body.enabled, req.auth!.userId));
}

export async function regenerate(req: Request, res: Response): Promise<void> {
  res.json(await svc.regenerateRegistrationToken(req.auth!.tenantId, req.auth!.userId));
}
