import { registry, z } from '../../openapi/registry';
import { ErrorResponseSchema } from '../../openapi/schemas';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });

const OrgSummarySchema = z
  .object({
    users: z.number(),
    doctors: z.number(),
    branches: z.object({ total: z.number(), active: z.number() }),
    modules: z.array(z.string()),
    patients: z.number().nullable(),
    appointments: z.number().nullable(),
  })
  .openapi('OrgSummary');

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/summary',
  operationId: 'getOrgSummary',
  tags: ['Reports'],
  summary: "The caller's own-tenant dashboard roll-up (RLS-scoped)",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Org summary', ...json(OrgSummarySchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
  },
});

const HourPoint = z.object({ hour: z.number(), scheduled: z.number(), walkIn: z.number() });
const RevenuePoint = z.object({ period: z.string(), billed: z.number(), collected: z.number() });
const CountPoint = z.object({ period: z.string(), value: z.number() });

const DashboardOverviewSchema = z
  .object({
    today: z.string().openapi({ example: '2026-08-16' }),
    loadByHour: z.array(HourPoint),
    today_counts: z.object({
      appointments: z.number(),
      checkedIn: z.number(),
      inConsultation: z.number(),
      completed: z.number(),
      newPatients: z.number(),
    }),
    revenue: z.array(RevenuePoint),
    registrations: z.array(CountPoint),
    outstandingPaise: z.number(),
    pendingLabOrders: z.number(),
    lowStock: z.array(
      z.object({ id: z.string(), name: z.string(), onHand: z.number(), reorderLevel: z.number() }),
    ),
    providerLoad: z.array(
      z.object({
        providerId: z.string(),
        name: z.string(),
        seen: z.number(),
        inProgress: z.number(),
        booked: z.number(),
      }),
    ),
  })
  .openapi('DashboardOverview');

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/overview',
  operationId: 'getDashboardOverview',
  tags: ['Reports'],
  summary: "The caller's own-tenant operational overview, behind every role dashboard",
  description:
    'RLS-scoped to the caller’s tenant. Today’s OPD load by hour (check-ins split into scheduled and walk-in), today’s queue counts, billed vs collected per day, registrations per day, total outstanding, pending lab orders, low-stock drugs, and today’s load per provider. Amounts are in paise. `days` is clamped to 7–90.',
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      days: z.coerce.number().int().min(7).max(90).optional(),
      // An explicit inclusive window (used by the shared period filter's calendar presets).
      // Takes precedence over `days` when both `from` and `to` are valid and `to >= from`.
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }),
  },
  responses: {
    200: { description: 'Dashboard overview', ...json(DashboardOverviewSchema) },
    401: { description: 'Not authenticated', ...json(ErrorResponseSchema) },
  },
});
