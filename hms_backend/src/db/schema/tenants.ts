import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// The tenant = a hospital/clinic organization. This is the tenancy boundary itself, so it is
// PLATFORM-managed (provisioned by an operator/super-admin), not tenant-scoped, and therefore
// carries no tenant_id and no RLS policy — the RLS template applies to tables that *hold*
// tenant-scoped data (e.g. branches, patients), which reference this table via tenant_id.
// See resources/architecture.md (Multi-Tenancy) and resources/rules.md (Tenancy Rules).
export const tenants = pgTable('tenants', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 200 }).notNull(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  // TRIAL | ACTIVE | SUSPENDED | EXPIRED | CANCELLED | DEACTIVATED (entitlement lifecycle uses
  // its own table; this is the tenant's own account status). Kept as varchar for now.
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
