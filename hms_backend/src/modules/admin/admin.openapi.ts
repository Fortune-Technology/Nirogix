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
} from './admin.schema';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const idParam = { params: z.object({ id: z.string().uuid() }) };
const notAuthed = { description: 'Not authenticated', ...json(ErrorResponseSchema) };
const forbidden = { description: 'Not a platform super-admin', ...json(ErrorResponseSchema) };
const AckSchema = z.object({ tenant: z.string(), module: z.string(), status: z.string() }).openapi('ModuleAck');
const ModuleCatalogSchema = z
  .object({
    modules: z.array(
      z.object({ key: z.string(), name: z.string(), hardDependencies: z.array(z.string()) }),
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
  request: { query: z.object({ months: z.coerce.number().int().min(3).max(36).optional() }) },
  responses: { 200: { description: 'Platform trends', ...json(PlatformTrendsSchema) }, 401: notAuthed, 403: forbidden },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/admin/stats',
  operationId: 'getPlatformStats',
  tags: ['Admin'],
  summary: 'Platform-wide statistics (aggregate-only, across all tenants)',
  description: 'Super-admin only. Counts/metrics only — never another tenant\'s row-level data (ADR-023).',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Platform stats', ...json(PlatformStatsSchema) }, 401: notAuthed, 403: forbidden },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/admin/module-catalog',
  operationId: 'listModuleCatalog',
  tags: ['Admin'],
  summary: 'List the module catalog (keys, names, hard dependencies) for onboarding',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Module catalog', ...json(ModuleCatalogSchema) }, 401: notAuthed, 403: forbidden },
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
  summary: 'Onboard a new tenant (create org → provision RBAC → grant modules → first org admin → branches)',
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
            reason: z.string().min(10).max(300).openapi({ description: 'Recorded in the audit trail; required' }),
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
    403: { description: 'Missing platform.support.impersonate, or the target is a platform operator', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Tenant or user not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    422: { description: 'Validation failed (reason too short, inactive tenant/user)', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});
