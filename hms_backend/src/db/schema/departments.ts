import { pgTable, uuid, varchar, boolean, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { branches } from './branches';
import { providers } from './providers';

/**
 * Departments — the hospital's clinical organisation (ADR-050).
 *
 * Until now the only trace of a department in the product was `visits.department`, a free-text
 * `varchar` typed at check-in. That cannot be listed, cannot be reported on reliably ("Ortho",
 * "ortho" and "Orthopaedics" are three departments), cannot carry a head, and cannot be
 * deactivated. This table makes it a real entity while leaving that column in place, so the
 * migration stays additive and reversible.
 *
 * Tenant-scoped, so it inherits the RLS policy mechanically. `branch_id` is nullable and follows
 * the platform's convention: **NULL = organization-wide**, a branch id = that branch only. A
 * single-site clinic never sets it; a group can run "Physiotherapy" at one branch only.
 *
 * `head_provider_id` is `set null` on delete rather than `restrict`: losing the head of a
 * department must not make the department unreadable.
 */
export const departments = pgTable(
  'departments',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),
    // Short code the front desk recognises — "ORTHO", "OPD-GEN". Unique within the tenant.
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    description: varchar('description', { length: 500 }),
    // FHIR-aligned: the department maps to a specialty where one applies, so a department's
    // doctors and its specialty stay one concept rather than two competing taxonomies.
    specialtyCode: varchar('specialty_code', { length: 50 }),
    headProviderId: uuid('head_provider_id').references(() => providers.id, {
      onDelete: 'set null',
    }),
    // Departments are deactivated, never deleted — visits and encounters reference them, and a
    // register from last year must still name the department it happened in.
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantCodeUnique: unique('departments_tenant_code_unique').on(t.tenantId, t.code),
  }),
);

export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
