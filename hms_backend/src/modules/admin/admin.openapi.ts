import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';
import {
  OnboardTenantBody,
  OnboardResponseSchema,
  TenantsResponseSchema,
  TenantSchema,
  TenantDetailSchema,
  TenantStatusBody,
  GrantModuleBody,
  SetCapabilityBody,
  TenantCapabilitiesSchema,
  CapabilityAckSchema,
  TenantModuleConfigSchema,
} from './admin.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const idParam = { params: z.object({ id: z.string().uuid() }) };
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const forbidden = { description: 'Not a platform super-admin', ...json(ErrorResponseSchema) };
const AckSchema = z
  .object({ tenant: z.string(), module: z.string(), status: z.string() })
  .openapi('ModuleAck');
const ModuleCatalogSchema = z
  .object({
    modules: z.array(
      z.object({
        key: z.string(),
        name: z.string(),
        category: z.string(),
        status: z.string(),
        alwaysOn: z.boolean(),
        capabilities: z.array(
          z.object({
            key: z.string(),
            name: z.string(),
            status: z.string(),
            dependencies: z.array(z.string()),
          }),
        ),
        hardDependencies: z.array(z.string()),
      }),
    ),
  })
  .openapi('ModuleCatalog');

const ActiveInactive = z.object({ total: z.number(), active: z.number(), inactive: z.number() });
const PlatformStatsSchema = z
  .object({
    organizations: ActiveInactive,
    hospitals: ActiveInactive,
    branches: z.object({ total: z.number(), active: z.number() }),
    doctors: z.number(),
    users: z.number(),
    modules: z.array(z.object({ module: z.string(), name: z.string(), tenants: z.number() })),
    patients: z.number().nullable(),
    appointments: z.number().nullable(),
  })
  .openapi('PlatformStats');

const TrendPoint = z.object({ period: z.string(), created: z.number(), cumulative: z.number() });
const SeverityPoint = z.object({
  period: z.string(),
  info: z.number(),
  warning: z.number(),
  critical: z.number(),
});
const PlatformTrendsSchema = z
  .object({
    from: z.string().openapi({ example: '2025-09' }),
    to: z.string().openapi({ example: '2026-08' }),
    hospitals: z.array(TrendPoint),
    users: z.array(TrendPoint),
    patients: z.array(TrendPoint),
    appointments: z.array(TrendPoint),
    events: z.array(SeverityPoint),
  })
  .openapi('PlatformTrends');

registry.registerPath({
  method: 'get',
  path: '/api/v1/admin/trends',
  operationId: 'getPlatformTrends',
  tags: ['Admin'],
  summary: 'Platform growth and activity over time (aggregate-only)',
  description:
    'Super-admin only. Monthly hospital / user / patient / appointment series derived from the records’ own `created_at`, each with a running cumulative, plus audit events per day by severity for the trailing 30 days. Counts only — never another tenant’s row-level data (ADR-023). `months` is clamped to 3–36.',
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      months: z.coerce.number().int().min(3).max(36).optional(),
      // An explicit inclusive window (used by the shared period filter's calendar presets).
      // Takes precedence over `months` when both `from` and `to` are valid and `to >= from`.
      from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
  },
  responses: {
    200: { description: 'Platform trends', ...json(PlatformTrendsSchema) },
    401: notAuthed,
    403: forbidden,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/admin/stats',
  operationId: 'getPlatformStats',
  tags: ['Admin'],
  summary: 'Platform-wide statistics (aggregate-only, across all tenants)',
  description:
    "Super-admin only. Counts/metrics only — never another tenant's row-level data (ADR-023).",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Platform stats', ...json(PlatformStatsSchema) },
    401: notAuthed,
    403: forbidden,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/admin/module-catalog',
  operationId: 'listModuleCatalog',
  tags: ['Admin'],
  summary: 'List the module catalog (keys, names, hard dependencies) for onboarding',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Module catalog', ...json(ModuleCatalogSchema) },
    401: notAuthed,
    403: forbidden,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/admin/tenants',
  operationId: 'listTenants',
  tags: ['Admin'],
  summary: 'List all tenants (platform operator)',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Tenants', ...json(TenantsResponseSchema) },
    401: notAuthed,
    403: forbidden,
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/admin/tenants',
  operationId: 'onboardTenant',
  tags: ['Admin'],
  summary:
    'Onboard a new tenant (create org → provision RBAC → grant modules → first org admin → branches)',
  description:
    'Operator-driven onboarding (ADR-020). Returns the first org-admin email and a one-time temporary password.',
  security: [{ bearerAuth: [] }],
  request: { body: json(OnboardTenantBody) },
  responses: {
    201: { description: 'Tenant onboarded', ...json(OnboardResponseSchema) },
    401: notAuthed,
    403: forbidden,
    409: { description: 'Tenant code already exists', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/admin/tenants/{id}',
  operationId: 'getTenant',
  tags: ['Admin'],
  summary: 'Get a tenant with its modules, branches and user count',
  security: [{ bearerAuth: [] }],
  request: idParam,
  responses: {
    200: { description: 'Tenant detail', ...json(TenantDetailSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/admin/tenants/{id}/status',
  operationId: 'updateTenantStatus',
  tags: ['Admin'],
  summary: "Change a tenant's account status",
  security: [{ bearerAuth: [] }],
  request: { ...idParam, body: json(TenantStatusBody) },
  responses: {
    200: { description: 'Updated', ...json(TenantSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/admin/tenants/{id}/modules',
  operationId: 'grantTenantModule',
  tags: ['Admin'],
  summary: 'Grant a module entitlement to a tenant (with its hard dependencies)',
  security: [{ bearerAuth: [] }],
  request: { ...idParam, body: json(GrantModuleBody) },
  responses: {
    201: { description: 'Granted', ...json(AckSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/admin/tenants/{id}/modules/{key}',
  operationId: 'revokeTenantModule',
  tags: ['Admin'],
  summary: 'Revoke a module entitlement from a tenant (soft — never deleted)',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string().uuid(), key: z.string() }) },
  responses: {
    200: { description: 'Revoked', ...json(AckSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/admin/tenants/{id}/module-config',
  operationId: 'getTenantModuleConfig',
  tags: ['Admin'],
  summary: 'The whole module/capability configuration for a tenant, grouped by domain (ADR-085)',
  description:
    'Super-admin only. Every module in the canonical registry grouped by domain, each with its entitled state and its capabilities with their enabled state (deny-by-exception). The single model the module manager consumes rather than re-deriving visibility — the backend stays the source of truth (§19).',
  security: [{ bearerAuth: [] }],
  request: idParam,
  responses: {
    200: { description: 'Tenant module configuration', ...json(TenantModuleConfigSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/admin/tenants/{id}/capabilities',
  operationId: 'listTenantCapabilities',
  tags: ['Admin'],
  summary:
    "List the capabilities of a tenant's entitled modules, with each one's enabled state (ADR-085)",
  description:
    'Super-admin only. Every declared capability of the tenant’s entitled modules; deny-by-exception, so a capability is enabled unless an override disables it. Modules with no capabilities contribute nothing.',
  security: [{ bearerAuth: [] }],
  request: idParam,
  responses: {
    200: { description: 'Tenant capabilities', ...json(TenantCapabilitiesSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/admin/tenants/{id}/capabilities',
  operationId: 'setTenantCapability',
  tags: ['Admin'],
  summary: "Enable or disable one capability of a tenant's module (ADR-085)",
  description:
    'Super-admin only. Deny-by-exception: `enabled:false` writes a disable override, `enabled:true` clears it. Refused (409) when it would break a dependency — disabling a capability another enabled one needs, or enabling one whose dependency is off.',
  security: [{ bearerAuth: [] }],
  request: { ...idParam, body: json(SetCapabilityBody) },
  responses: {
    200: { description: 'Updated', ...json(CapabilityAckSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
    409: { description: 'Dependency conflict', ...json(ErrorResponseSchema) },
    422: { description: 'Validation error', ...json(ErrorResponseSchema) },
  },
});

const EmailTemplatesSchema = z
  .object({
    templates: z.array(
      z.object({
        key: z.string(),
        name: z.string(),
        category: z.string(),
        description: z.string(),
        subject: z.string(),
      }),
    ),
  })
  .openapi('EmailTemplates');

const EmailTemplatePreviewSchema = z
  .object({ key: z.string(), subject: z.string(), html: z.string() })
  .openapi('EmailTemplatePreview');

registry.registerPath({
  method: 'get',
  path: '/api/v1/admin/email-templates',
  operationId: 'listEmailTemplates',
  tags: ['Admin'],
  summary: 'List the central email template catalogue (developer/operator preview tool)',
  description:
    'Super-admin only. Every application email template with its category, description and rendered subject. Read-only; no tenant data is touched.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Email templates', ...json(EmailTemplatesSchema) },
    401: notAuthed,
    403: forbidden,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/admin/email-templates/{key}/preview',
  operationId: 'previewEmailTemplate',
  tags: ['Admin'],
  summary: 'Render one email template from its sample data (developer/operator preview tool)',
  description:
    'Super-admin only. Returns the rendered subject + HTML of a template using realistic sample data, so the design and copy can be reviewed without triggering the business action.',
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ key: z.string() }) },
  responses: {
    200: { description: 'Rendered email', ...json(EmailTemplatePreviewSchema) },
    401: notAuthed,
    403: forbidden,
    404: { description: 'Not found', ...json(ErrorResponseSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/admin/support-sessions',
  operationId: 'startSupportSession',
  tags: ['Admin'],
  summary: 'Start a support session inside a tenant (impersonation)',
  description:
    'Requires `platform.support.impersonate`. Mints a session for the target user WITHOUT their password, ' +
    'carrying only that target user roles, so the operator privileges never enter the tenant. Refuses to target a ' +
    'platform operator, an inactive user, an inactive tenant, or to nest inside an existing support session. ' +
    'Start and end are both written to the TARGET tenant audit trail with the operator, reason and ticket reference.',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            tenantId: z.string().uuid(),
            userId: z.string().uuid(),
            reason: z
              .string()
              .min(10)
              .max(300)
              .openapi({ description: 'Recorded in the audit trail; required' }),
            ticketRef: z.string().max(80).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Support session started; refresh cookie now belongs to the target tenant',
      content: {
        'application/json': {
          schema: z.object({
            accessToken: z.string(),
            user: z.object({ id: z.string(), email: z.string(), fullName: z.string() }),
            tenant: z.object({ id: z.string(), name: z.string() }),
            message: z.string(),
          }),
        },
      },
    },
    403: {
      description: 'Missing platform.support.impersonate, or the target is a platform operator',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Tenant or user not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    422: {
      description: 'Validation failed (reason too short, inactive tenant/user)',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
