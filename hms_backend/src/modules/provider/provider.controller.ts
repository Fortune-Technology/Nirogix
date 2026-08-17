import type { Request, Response } from 'express';
import { Errors } from '../../http/error';
import * as svc from './provider.service';
import type { Provider, SpecialtyFormTemplate } from '../../db/schema';

function toProvider(p: Provider & { specialties: string[] }) {
  return {
    id: p.id,
    fullName: p.fullName,
    gender: p.gender,
    registrationNumber: p.registrationNumber,
    qualification: p.qualification,
    email: p.email,
    phone: p.phone,
    userId: p.userId,
    consultationFeePaise: p.consultationFeePaise,
    isActive: p.isActive,
    specialties: p.specialties,
  };
}

function toTemplate(t: SpecialtyFormTemplate) {
  return {
    id: t.id,
    specialtyCode: t.specialtyCode,
    key: t.key,
    name: t.name,
    version: t.version,
    isActive: t.isActive,
  };
}

export async function listSpecialties(_req: Request, res: Response): Promise<void> {
  res.json({ specialties: await svc.listSpecialties() });
}

export async function listProviders(req: Request, res: Response): Promise<void> {
  const rows = await svc.listProvidersWithRoles(req.auth!.tenantId);
  res.json({ providers: rows.map(toProvider) });
}

export async function createProvider(req: Request, res: Response): Promise<void> {
  const p = await svc.createProvider(req.auth!.tenantId, req.body, req.auth!.userId);
  res.status(201).json(toProvider({ ...p, specialties: [] }));
}

export async function getProvider(req: Request, res: Response): Promise<void> {
  const p = await svc.getProviderWithRoles(req.auth!.tenantId, req.params.id!);
  if (!p) throw Errors.notFound('Provider not found');
  const specialtiesList = p.roles.filter((r) => r.isActive).map((r) => r.specialtyCode);
  res.json(toProvider({ ...p, specialties: specialtiesList }));
}

export async function updateProvider(req: Request, res: Response): Promise<void> {
  const p = await svc.updateProvider(req.auth!.tenantId, req.params.id!, req.body, req.auth!.userId);
  const withRoles = await svc.getProviderWithRoles(req.auth!.tenantId, p.id);
  const specialtiesList = (withRoles?.roles ?? []).filter((r) => r.isActive).map((r) => r.specialtyCode);
  res.json(toProvider({ ...p, specialties: specialtiesList }));
}

export async function assignSpecialty(req: Request, res: Response): Promise<void> {
  const role = await svc.assignSpecialty(req.auth!.tenantId, req.params.id!, req.body, req.auth!.userId);
  if (!role) throw Errors.notFound('Provider not found');
  res.status(201).json({
    id: role.id,
    providerId: role.providerId,
    specialtyCode: role.specialtyCode,
    role: role.role,
    isPrimary: role.isPrimary,
  });
}

export async function listTemplates(req: Request, res: Response): Promise<void> {
  const t = await svc.listFormTemplates(req.auth!.tenantId);
  res.json({ templates: t.map(toTemplate) });
}

export async function createTemplate(req: Request, res: Response): Promise<void> {
  const t = await svc.createFormTemplate(req.auth!.tenantId, req.body, req.auth!.userId);
  res.status(201).json(toTemplate(t));
}
