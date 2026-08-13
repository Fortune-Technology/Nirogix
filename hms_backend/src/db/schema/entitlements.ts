import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { branches } from './branches';

// Tenant module entitlements (resources/architecture.md → Module Entitlements). Materialized per
// (tenant, module, optional branch). branch_id NULL = organization-wide; set = branch-specific
// (schema supports it from day one; management UI is later). Records are never physically deleted —
// state transitions are data (status + timestamps). Evaluation always combines status + effective
// dates, never status alone.
//
// status: TRIAL | ACTIVE | SUSPENDED | EXPIRED | CANCELLED | DEACTIVATED
export const tenantEntitlements = pgTable('tenant_entitlements', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  module: varchar('module', { length: 50 }).notNull(),
  branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
  effectiveUntil: timestamp('effective_until', { withTimezone: true }),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  reason: varchar('reason', { length: 300 }),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type TenantEntitlement = typeof tenantEntitlements.$inferSelect;
