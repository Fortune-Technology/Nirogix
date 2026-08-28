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
    // Capability keys to switch OFF at onboarding. Deny-by-exception (ADR-085): every capability
    // of a granted module is on unless it is listed here.
    disabledCapabilities: z.array(z.string()).optional(),
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

// Toggle one capability of an entitled module on/off for a tenant (ADR-085). Deny-by-exception:
// `enabled: true` clears any disable (ACTIVE); `enabled: false` writes a disable override.
export const SetCapabilityBody = z
  .object({
    module: z.string().min(1),
    capability: z.string().min(1),
    enabled: z.boolean(),
  })
  .openapi('SetCapabilityBody');

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

export const TenantCapabilitiesSchema = z
  .object({
    capabilities: z.array(
      z.object({
        module: z.string(),
        moduleName: z.string(),
        capability: z.string(),
        name: z.string(),
        status: z.string(),
        enabled: z.boolean(),
        dependencies: z.array(z.string()),
      }),
    ),
  })
  .openapi('TenantCapabilities');

export const CapabilityAckSchema = z
  .object({ tenant: z.string(), capability: z.string(), enabled: z.boolean() })
  .openapi('CapabilityAck');

export const TenantModuleConfigSchema = z
  .object({
    categories: z.array(z.object({ key: z.string(), name: z.string() })),
    modules: z.array(
      z.object({
        key: z.string(),
        name: z.string(),
        category: z.string(),
        status: z.string(),
        alwaysOn: z.boolean(),
        hardDependencies: z.array(z.string()),
        entitled: z.boolean(),
        capabilities: z.array(
          z.object({
            key: z.string(),
            name: z.string(),
            status: z.string(),
            enabled: z.boolean(),
            dependencies: z.array(z.string()),
          }),
        ),
      }),
    ),
  })
  .openapi('TenantModuleConfig');

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
    // Identity only — never clinical data. Used for tenant administration and for
    // choosing a support-session target (ADR-037).
    users: z.array(
      z.object({
        id: z.string().uuid(),
        email: z.string(),
        fullName: z.string(),
        status: z.string(),
        roles: z.array(z.string()),
      }),
    ),
  })
  .openapi('TenantDetail');
