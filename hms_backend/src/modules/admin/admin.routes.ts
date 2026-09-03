import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requirePermission } from '../../http/requirePermission';
import {
  OnboardTenantBody,
  TenantStatusBody,
  GrantModuleBody,
  SetCapabilityBody,
} from './admin.schema';
import * as c from './admin.controller';

// Super-Admin (platform) surface — tenant onboarding + management. Cross-tenant by nature, so it
// is NOT gated by requireModule; it is gated by `platform.tenants.manage`, which only a
// super_admin (WILDCARD) resolves (ADR-020). Every route re-checks auth → permission server-side.
export const adminRouter = Router();

const guard = [requireAuth, requirePermission(PERMISSIONS.TENANTS_MANAGE)] as const;

adminRouter.get('/admin/module-catalog', ...guard, asyncHandler(c.listModuleCatalog));
adminRouter.get('/admin/stats', ...guard, asyncHandler(c.getStats));
adminRouter.get('/admin/trends', ...guard, asyncHandler(c.getTrends));
adminRouter.get('/admin/tenants', ...guard, asyncHandler(c.listTenants));
adminRouter.post(
  '/admin/tenants',
  ...guard,
  validate({ body: OnboardTenantBody }),
  asyncHandler(c.onboardTenant),
);
adminRouter.get('/admin/tenants/:id', ...guard, asyncHandler(c.getTenant));
adminRouter.patch(
  '/admin/tenants/:id/status',
  ...guard,
  validate({ body: TenantStatusBody }),
  asyncHandler(c.updateTenantStatus),
);
adminRouter.post(
  '/admin/tenants/:id/modules',
  ...guard,
  validate({ body: GrantModuleBody }),
  asyncHandler(c.grantModule),
);
adminRouter.delete('/admin/tenants/:id/modules/:key', ...guard, asyncHandler(c.revokeModule));

// The whole module/capability configuration for a tenant (three-level manager, ADR-085 §19).
adminRouter.get('/admin/tenants/:id/module-config', ...guard, asyncHandler(c.getModuleConfig));

// Capability configuration (ADR-085) — toggle a module's sub-features on/off for a tenant.
adminRouter.get('/admin/tenants/:id/capabilities', ...guard, asyncHandler(c.getTenantCapabilities));
adminRouter.put(
  '/admin/tenants/:id/capabilities',
  ...guard,
  validate({ body: SetCapabilityBody }),
  asyncHandler(c.setTenantCapability),
);

// Email template preview (developer/operator tool) — list the central catalogue and render one
// from sample data. Read-only, no tenant data; gated like the rest of the platform surface.
adminRouter.get('/admin/email-templates', ...guard, asyncHandler(c.listEmailTemplatesCtl));
adminRouter.get(
  '/admin/email-templates/:key/preview',
  ...guard,
  asyncHandler(c.previewEmailTemplateCtl),
);

// Support sessions (ADR-037). Gated by its own permission so a future support role
// can be granted this WITHOUT full tenant management.
adminRouter.post(
  '/admin/support-sessions',
  requireAuth,
  requirePermission(PERMISSIONS.PLATFORM_SUPPORT_IMPERSONATE),
  asyncHandler(c.postSupportSession),
);
