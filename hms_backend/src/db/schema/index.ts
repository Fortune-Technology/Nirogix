// Drizzle schema barrel.
//
// Every tenant-scoped table (one that carries `tenant_id`) automatically receives the
// Row-Level Security policy from ../rls.ts when migrations run — see resources/rules.md
// (Tenancy Rules). The `tenants` table itself is platform-managed and intentionally not
// tenant-scoped (see ./tenants.ts).
export * from './tenants';
export * from './branches';
export * from './users';
export * from './sessions';
export * from './permissions';
export * from './roles';
export * from './userRoles';
export * from './entitlements';
