import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  jsonb,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';

// System + hospital master data (ADR-072). Two tables, one read model:
//
//  * `reference_catalog` — SYSTEM master data. Global, seeded from code data-files (like the
//    `specialties` catalog, ADR-008): it has NO `tenant_id`, so the RLS auto-policy never targets
//    it, every tenant can read it, and a tenant can never write it (the tenant DB client cannot
//    reach a table with no tenant_id through a normal INSERT the policy would allow, and there is
//    no write endpoint). Managed by the platform through the seeders / a future System-Admin editor.
//
//  * `tenant_reference_items` — HOSPITAL custom data for the "simple list" categories (e.g.
//    vaccinations). Tenant-scoped, so it receives the standard `tenant_isolation` RLS policy and a
//    hospital's custom items are invisible to any other tenant. The read model UNIONs the two by
//    `category`, tagging each row system|custom.
//
// The richer priced catalogues (lab tests, drugs, services) keep their existing tenant tables for
// custom+priced rows; those tables gain a nullable `catalog_code` that records which catalog item a
// row was adopted from (NULL = pure custom), so nothing that already exists breaks. `attributes` is
// display/pre-fill metadata for a reference list, not a core clinical entity — invariant #5 (no EAV
// on core entities) is untouched: patients, encounters, lab_tests and drugs stay strongly typed.

/** Category discriminator. Add a value here and seed rows for it — no schema migration needed. */
export type ReferenceCategory = 'lab_test' | 'drug' | 'service' | 'vaccine' | 'department';

// SYSTEM master data — global, no tenant_id, no RLS. Seeded in every environment (incl. production).
export const referenceCatalog = pgTable(
  'reference_catalog',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    category: varchar('category', { length: 40 }).notNull(),
    // Stable business code, unique within a category. This is what a tenant row references.
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    // Category-specific pre-fill hints (lab_test: sampleType/unit/refLow/refHigh/loinc; drug:
    // form/strength/unit/hsnSac; vaccine: schedule; department: specialtyCode). Never clinical data.
    attributes: jsonb('attributes')
      .notNull()
      .default(sql`'{}'::jsonb`),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniq: unique('reference_catalog_category_code_unique').on(t.category, t.code) }),
);

// HOSPITAL custom data for simple-list categories. Tenant-scoped → automatic RLS.
export const tenantReferenceItems = pgTable(
  'tenant_reference_items',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    category: varchar('category', { length: 40 }).notNull(),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    attributes: jsonb('attributes')
      .notNull()
      .default(sql`'{}'::jsonb`),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniq: unique('tenant_reference_items_unique').on(t.tenantId, t.category, t.code) }),
);

export type ReferenceCatalogRow = typeof referenceCatalog.$inferSelect;
export type TenantReferenceItem = typeof tenantReferenceItems.$inferSelect;
