import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { branches } from './branches';

// Tenant CAPABILITY entitlements (ADR-085) — the capability tier beneath `tenant_entitlements`.
//
// Semantics are DENY-BY-EXCEPTION: a capability is ENABLED by default whenever its module is
// entitled. A row here exists only to OVERRIDE that default for a (tenant, module, capability) —
// to turn a capability OFF, or to scope/time-bound it — exactly as a user permission override is
// an exception to a role. So an EMPTY table means every capability of every entitled module is on,
// which is why the migration that introduces this table needs no data backfill and preserves
// existing tenant behaviour byte-for-byte. Records are never physically deleted (invariant #6);
// state transitions are data (status + timestamps). Evaluation always combines status + effective
// dates, never status alone — matching `tenant_entitlements`.
//
// branch_id NULL = organization-wide; set = branch-specific (schema supports it from day one, the
// resolver reads org-wide today; branch-scoped capability config is a later UI).
//
// status: ACTIVE (explicitly on — same as the default) | DISABLED | SUSPENDED | DEACTIVATED
export const tenantCapabilityEntitlements = pgTable('tenant_capability_entitlements', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  module: varchar('module', { length: 50 }).notNull(),
  capability: varchar('capability', { length: 80 }).notNull(),
  branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
  effectiveUntil: timestamp('effective_until', { withTimezone: true }),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  reason: varchar('reason', { length: 300 }),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type TenantCapabilityEntitlement = typeof tenantCapabilityEntitlements.$inferSelect;
