import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requirePermission } from '../../http/requirePermission';
import { OnboardTenantBody, TenantStatusBody, GrantModuleBody } from './admin.schema';
import * as c from './admin.controller';

// Super-Admin (platform) surface — tenant onboarding + management. Cross-tenant by nature, so it
// is NOT gated by requireModule; it is gated by `platform.tenants.manage`, which only a
// super_admin (WILDCARD) resolves (ADR-020). Every route re-checks auth → permission server-side.
export const adminRouter = Router();

const guard = [requireAuth, requirePermission(PERMISSIONS.TENANTS_MANAGE)] as const;

adminRouter.get('/admin/module-catalog', ...guard, asyncHandler(c.listModuleCatalog));
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
