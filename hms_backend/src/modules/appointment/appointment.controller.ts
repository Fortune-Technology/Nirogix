import type { Request, Response } from 'express';
import { paginate } from '../../http/respond';
import { ListAppointmentsQuery } from './appointment.schema';
import * as svc from './appointment.service';

export async function listAppointments(req: Request, res: Response): Promise<void> {
  const q = ListAppointmentsQuery.parse(req.query);
  const { rows, total } = await svc.listAppointments(req.auth!.tenantId, q);
  res.json(paginate(rows, total, q.page, q.pageSize));
}

export async function bookAppointment(req: Request, res: Response): Promise<void> {
  const a = await svc.bookAppointment(req.auth!.tenantId, req.body, req.auth!.userId);
  res.status(201).json({ id: a.id, status: a.status, scheduledAt: a.scheduledAt.toISOString() });
}

export async function cancelAppointment(req: Request, res: Response): Promise<void> {
  const a = await svc.cancelAppointment(
    req.auth!.tenantId,
    req.params.id!,
    req.body?.reason,
    req.auth!.userId,
  );
  res.json({ id: a.id, status: a.status });
}
