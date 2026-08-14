import type { Request, Response } from 'express';
import { Errors } from '../../http/error';
import { paginate } from '../../http/respond';
import { ListPatientsQuery } from './patient.schema';
import * as svc from './patient.service';
import type { Patient } from '../../db/schema';

function toPatient(p: Patient) {
  return {
    id: p.id,
    uhid: p.uhid,
    firstName: p.firstName,
    lastName: p.lastName,
    gender: p.gender,
    dateOfBirth: p.dateOfBirth, // drizzle `date` → 'YYYY-MM-DD' string
    phone: p.phone,
    email: p.email,
    bloodGroup: p.bloodGroup,
    addressLine: p.addressLine,
    city: p.city,
    state: p.state,
    pincode: p.pincode,
    abhaNumber: p.abhaNumber,
    emergencyContactName: p.emergencyContactName,
    emergencyContactPhone: p.emergencyContactPhone,
    branchId: p.branchId,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  };
}

export async function listPatients(req: Request, res: Response): Promise<void> {
  const { page, pageSize, search } = ListPatientsQuery.parse(req.query);
  const { rows, total } = await svc.listPatients(req.auth!.tenantId, { page, pageSize, search });
  res.json(paginate(rows.map(toPatient), total, page, pageSize));
}

export async function createPatient(req: Request, res: Response): Promise<void> {
  const p = await svc.createPatient(req.auth!.tenantId, req.body, req.auth!.userId);
  res.status(201).json(toPatient(p));
}

export async function getPatient(req: Request, res: Response): Promise<void> {
  const p = await svc.getPatient(req.auth!.tenantId, req.params.id!);
  if (!p) throw Errors.notFound('Patient not found');
  res.json(toPatient(p));
}

export async function updatePatient(req: Request, res: Response): Promise<void> {
  const p = await svc.updatePatient(req.auth!.tenantId, req.params.id!, req.body, req.auth!.userId);
  res.json(toPatient(p));
}
