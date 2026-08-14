import type { Request, Response } from 'express';
import { Errors } from '../../http/error';
import { MODULE_CATALOG } from '../entitlement/moduleCatalog';
import * as svc from './admin.service';

export async function listModuleCatalog(_req: Request, res: Response): Promise<void> {
  res.json({ modules: MODULE_CATALOG.map((m) => ({ key: m.key, name: m.name, hardDependencies: m.hardDependencies })) });
}

export async function getStats(_req: Request, res: Response): Promise<void> {
  res.json(await svc.getPlatformStats());
}

function toTenant(t: { id: string; code: string; name: string; status: string; createdAt: Date }) {
  return { id: t.id, code: t.code, name: t.name, status: t.status, createdAt: t.createdAt.toISOString() };
}

export async function onboardTenant(req: Request, res: Response): Promise<void> {
  const result = await svc.onboardTenant(req.body, req.auth!.userId);
  res.status(201).json({
    tenant: toTenant(result.tenant),
    admin: result.admin,
  });
}

export async function listTenants(_req: Request, res: Response): Promise<void> {
  const rows = await svc.listTenants();
  res.json({ tenants: rows.map(toTenant) });
}

export async function getTenant(req: Request, res: Response): Promise<void> {
  const detail = await svc.getTenantDetail(req.params.id!);
  if (!detail) throw Errors.notFound('Tenant not found');
  res.json({
    ...toTenant(detail),
    modules: detail.modules,
    branches: detail.branches,
    userCount: detail.userCount,
  });
}

export async function updateTenantStatus(req: Request, res: Response): Promise<void> {
  const t = await svc.setTenantStatus(req.params.id!, req.body.status, req.auth!.userId);
  res.json(toTenant(t));
}

export async function grantModule(req: Request, res: Response): Promise<void> {
  if (!(await svc.tenantExists(req.params.id!))) throw Errors.notFound('Tenant not found');
  await svc.grantTenantModule(req.params.id!, req.body.module, req.auth!.userId);
  res.status(201).json({ tenant: req.params.id, module: req.body.module, status: 'granted' });
}

export async function revokeModule(req: Request, res: Response): Promise<void> {
  if (!(await svc.tenantExists(req.params.id!))) throw Errors.notFound('Tenant not found');
  await svc.revokeTenantModule(req.params.id!, req.params.key!, req.auth!.userId);
  res.json({ tenant: req.params.id, module: req.params.key, status: 'revoked' });
}
