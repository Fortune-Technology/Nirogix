// Drizzle schema barrel.
//
// Tables are added here per module as Phase 0 and later milestones land
// (tenants, organizations, branches, users, roles, permissions, entitlements,
// audit_log, notification_log, ...).
//
// Every tenant-scoped table MUST carry a `tenant_id` column and a PostgreSQL
// Row-Level Security policy that reads current_setting('app.tenant_id') — see
// runWithTenant() in ../tenantContext.ts and resources/rules.md (Tenancy Rules).
export {};
