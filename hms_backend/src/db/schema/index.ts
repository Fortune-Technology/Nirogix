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
// Capability tier beneath module entitlements — deny-by-exception (ADR-085).
export * from './capabilityEntitlements';
export * from './auditLog';
export * from './notifications';
export * from './files';
export * from './signatures';
export * from './imports';
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
// ABDM Milestone 2 — care contexts + consent artefacts (ADR-087).
export * from './abdmM2';
export * from './abdmM3';
export * from './abdmM4';
// Per-hospital workflow configuration + the vitals observations it governs — ADR-113.
export * from './workflow';
// Treatment cases — the episode a run of visits belongs to (ADR-116).
export * from './cases';
// The consultation fee schedule — ADR-117.
export * from './feeRules';
// Patient self check-in announcements — ADR-118.
export * from './selfCheckin';
// Documents attached to a patient, visit or case — ADR-119.
export * from './patientDocuments';
// What a seeder has already done, so it never does it twice — ADR-122. Platform-managed,
// no tenant_id, therefore no RLS policy (like ./tenants).
export * from './seedMarkers';
