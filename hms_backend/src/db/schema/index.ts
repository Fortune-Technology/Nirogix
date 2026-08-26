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
export * from './auditLog';
export * from './notifications';
export * from './files';
export * from './providers';
export * from './departments';
export * from './branding';
export * from './organization';
export * from './platformBranding';
export * from './patients';
// Patient identity is PLATFORM-managed (no tenant_id, like ./tenants) and reaches into a
// tenant only through patient_identity_link, which IS tenant-scoped (ADR-052).
export * from './patientIdentity';
export * from './appointments';
export * from './visits';
export * from './billing';
export * from './emr';
export * from './pharmacy';
export * from './lab';
export * from './services';
export * from './referrals';
// System master data (global, no tenant_id) + hospital custom overlay (tenant-scoped) — ADR-072.
export * from './referenceData';
export * from './immunizations';
// Per-hospital (branch) availability overlay for master-data items — ADR-073.
export * from './branchAvailability';
// Staff forgot-password tokens (ADR-081) — tenant-scoped, hash-only, single-use.
export * from './passwordResetTokens';
// ABDM Milestone 1 — facility identity + verification transactions (ADR-084).
export * from './abdm';
