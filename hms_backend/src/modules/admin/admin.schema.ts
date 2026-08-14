import { z } from '../../openapi/registry';

// ---- Requests --------------------------------------------------------------

const BranchInput = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
});

export const OnboardTenantBody = z
  .object({
    code: z
      .string()
      .min(2)
      .max(50)
      .regex(/^[A-Z0-9_-]+$/, 'Use A–Z, 0–9, _ or - (the org login code)'),
    name: z.string().min(2).max(200),
    // Initial module entitlements. Defaults to the MVP set in the service. Order-independent —
    // the service grants in hard-dependency order.
    modules: z.array(z.string()).optional(),
    admin: z.object({
      email: z.string().email(),
      fullName: z.string().min(2).max(200),
    }),
    branches: z.array(BranchInput).optional(),
  })
  .openapi('OnboardTenantBody');

export const TenantStatusBody = z
  .object({
    status: z.enum(['active', 'suspended', 'cancelled', 'deactivated']),
  })
  .openapi('TenantStatusBody');

export const GrantModuleBody = z
  .object({ module: z.string().min(1) })
  .openapi('GrantModuleBody');

// ---- Responses -------------------------------------------------------------

export const TenantSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    status: z.string(),
    createdAt: z.string(),
  })
  .openapi('Tenant');

export const TenantsResponseSchema = z
  .object({ tenants: z.array(TenantSchema) })
  .openapi('TenantsResponse');

// Returned once at onboarding — the operator hands the temp password to the org admin, who
// should change it on first login. Not stored or returned again.
export const OnboardResponseSchema = z
  .object({
    tenant: TenantSchema,
    admin: z.object({ email: z.string(), tempPassword: z.string() }),
  })
  .openapi('OnboardTenantResponse');

export const TenantDetailSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    status: z.string(),
    createdAt: z.string(),
    modules: z.array(z.string()),
    branches: z.array(
      z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), isActive: z.boolean() }),
    ),
    userCount: z.number().int(),
  })
  .openapi('TenantDetail');
