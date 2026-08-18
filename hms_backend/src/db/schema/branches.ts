import { pgTable, uuid, varchar, boolean, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';

// A branch of a tenant (multi-branch). This IS tenant-scoped: it carries `tenant_id` and gets
// the RLS policy from src/db/rls.ts. Every future tenant-scoped table follows this shape —
// a `tenant_id` column + an RLS policy. `branch_id` scoping (nullable) is layered on later
// tables, not here (this table defines branches).
export const branches = pgTable(
  'branches',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 200 }).notNull(),
    code: varchar('code', { length: 50 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Branch code is unique within a tenant, not globally.
    tenantCodeUnique: unique('branches_tenant_code_unique').on(t.tenantId, t.code),
  }),
);

export type Branch = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;
