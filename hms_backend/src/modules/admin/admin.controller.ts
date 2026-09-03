import type { Request, Response } from 'express';
import { z } from '../../openapi/registry';
import { MODULE_REGISTRY } from '@hms/permissions';
import { Errors } from '../../http/error';
import {
  getTenantModuleConfig,
  listTenantCapabilities,
  setCapabilityStatus,
} from '../entitlement/capability.service';
import * as svc from './admin.service';
import {
  EMAIL_TEMPLATES,
  listEmailTemplates,
  renderEmailTemplateSample,
  type EmailTemplateKey,
} from '../notification/email';
import { MESSAGES } from '../notification/messages';

export async function listModuleCatalog(_req: Request, res: Response): Promise<void> {
  // The whole registry with its domain + lifecycle status, so onboarding can group modules by
  // domain and mark the ones with no screens yet (ADR-085).
  res.json({
    modules: MODULE_REGISTRY.map((m) => ({
      key: m.key,
      name: m.name,
      category: m.category,
      status: m.status,
      alwaysOn: m.alwaysOn === true,
      hardDependencies: [...m.hardDependencies],
      // Declared capabilities, so onboarding can offer capability-level choices up front.
      capabilities: m.capabilities.map((c) => ({
        key: c.key,
        name: c.name,
        status: c.status,
        dependencies: [...(c.dependencies ?? [])],
      })),
    })),
  });
}

export async function getStats(_req: Request, res: Response): Promise<void> {
  res.json(await svc.getPlatformStats());
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Every series is derived from real `created_at` rows and the audit log (ADR-043);
// the window is clamped so one request cannot ask for an unbounded scan. An explicit
// inclusive `from`/`to` (ISO, `to >= from`) drives the shared period filter's presets;
// otherwise the legacy rolling `months` count is used (default 12, clamped 3–36).
export async function getTrends(req: Request, res: Response): Promise<void> {
  const from =
    typeof req.query.from === 'string' && ISO_DATE.test(req.query.from) ? req.query.from : null;
  const to = typeof req.query.to === 'string' && ISO_DATE.test(req.query.to) ? req.query.to : null;
  if (from && to && to >= from) {
    res.json(await svc.getPlatformTrends({ from, to }));
    return;
  }
  const raw = Number(req.query.months ?? 12);
  const months = Number.isFinite(raw) ? Math.min(36, Math.max(3, Math.trunc(raw))) : 12;
  res.json(await svc.getPlatformTrends(months));
}

function toTenant(t: { id: string; code: string; name: string; status: string; createdAt: Date }) {
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
  };
}

export async function onboardTenant(req: Request, res: Response): Promise<void> {
  const result = await svc.onboardTenant(req.body, req.auth!.userId);
  res.status(201).json({
    tenant: toTenant(result.tenant),
    admin: result.admin,
    // Canonical copy from the central catalogue — the shared client shows this in every frontend.
    message: MESSAGES.tenant.onboarded,
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
    // Identity only, for tenant administration and support-session targeting (ADR-037).
    users: detail.users,
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

// The whole module/capability configuration for a tenant (ADR-085 §19) — every module by domain
// with each capability's enabled state. Drives the three-level admin module manager.
export async function getModuleConfig(req: Request, res: Response): Promise<void> {
  if (!(await svc.tenantExists(req.params.id!))) throw Errors.notFound('Tenant not found');
  res.json(await getTenantModuleConfig(req.params.id!));
}

// Capability configuration (ADR-085) — the sub-features of the tenant's entitled modules.
export async function getTenantCapabilities(req: Request, res: Response): Promise<void> {
  if (!(await svc.tenantExists(req.params.id!))) throw Errors.notFound('Tenant not found');
  res.json({ capabilities: await listTenantCapabilities(req.params.id!) });
}

export async function setTenantCapability(req: Request, res: Response): Promise<void> {
  if (!(await svc.tenantExists(req.params.id!))) throw Errors.notFound('Tenant not found');
  const { module, capability, enabled } = req.body as {
    module: string;
    capability: string;
    enabled: boolean;
  };
  try {
    await setCapabilityStatus(req.params.id!, module, capability, enabled ? 'ACTIVE' : 'DISABLED', {
      changedBy: req.auth!.userId,
    });
  } catch (e) {
    // Dependency guards and unknown-capability checks throw plain Errors — surface the message
    // to the operator (409) rather than a 500, so the shared toast explains what to fix.
    throw Errors.conflict(e instanceof Error ? e.message : 'Could not change the capability');
  }
  res.json({ tenant: req.params.id, capability, enabled });
}

const SupportSessionBody = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  /** Written into the audit trail in the target tenant — required, not optional. */
  reason: z.string().trim().min(10).max(300),
  ticketRef: z.string().trim().max(80).optional(),
});

/**
 * Starts a support session. The response sets the refresh cookie for the TARGET
 * tenant, so the operator's browser continues as that user until they exit.
 */
export async function postSupportSession(req: Request, res: Response): Promise<void> {
  const input = SupportSessionBody.parse(req.body);
  const operator = req.auth!;
  if (operator.impersonatedBy) {
    // No nesting: a support session cannot launch another one.
    throw Errors.forbidden('You are already in a support session');
  }
  const result = await svc.startSupportSession(
    { userId: operator.userId, tenantId: operator.tenantId },
    input,
    { userAgent: req.headers['user-agent'], ip: req.ip },
  );
  // NO refresh cookie for a support session (ADR-037). Cookies are shared across
  // tabs, so setting one would hijack the operator's own platform session in every
  // other tab — a silent tenant switch, which is exactly what must never happen.
  // The support session therefore lives only as an in-memory access token in the
  // tab that opened it, and expires with that token rather than being refreshable.
  res.json({
    accessToken: result.accessToken,
    user: result.user,
    tenant: result.tenant,
    message: `Support session started in ${result.tenant.name}.`,
  });
}

// ---- Email template preview (developer/operator tool) -----------------------
// A read-only window onto the central email catalogue (notification/email/email-templates.ts):
// list every template, and render one from its own realistic sample data — so the design and copy
// can be reviewed without triggering the underlying business action. No tenant data is touched;
// the preview always renders from static sample data.

export async function listEmailTemplatesCtl(_req: Request, res: Response): Promise<void> {
  res.json({ templates: listEmailTemplates() });
}

export async function previewEmailTemplateCtl(req: Request, res: Response): Promise<void> {
  const key = req.params.key as EmailTemplateKey;
  if (!(key in EMAIL_TEMPLATES)) throw Errors.notFound('Email template not found');
  const { subject, html } = renderEmailTemplateSample(key);
  res.json({ key, subject, html });
}
