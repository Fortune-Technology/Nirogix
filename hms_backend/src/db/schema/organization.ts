import { pgTable, uuid, varchar, integer, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';

/**
 * The hospital's own identity — registered address, contact details and statutory numbers
 * (ADR-049, closing BACKLOG U-8).
 *
 * Deliberately a tenant-SCOPED table rather than columns on `tenants`: `tenants` is the
 * tenancy boundary itself and is platform-managed (no `tenant_id`, no RLS), while this is
 * data the hospital's own administrator owns and edits. Carrying `tenant_id` means it picks
 * up the RLS policy automatically from `src/db/rls.ts`, so one hospital can never read or
 * write another's registered details.
 *
 * One row per tenant (organization level). A per-branch override is a later, additive change
 * — a nullable `branch_id` plus a resolve-branch-then-organization read — and is recorded in
 * BACKLOG rather than half-built here.
 *
 * Every field is optional. A printed document renders the lines that exist and omits the rest:
 * a wrong or invented address on a tax invoice is worse than no address at all.
 */
export const organizationProfile = pgTable(
  'organization_profile',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    // The registered/legal name when it differs from the trading name held on `tenants.name`.
    legalName: varchar('legal_name', { length: 200 }),
    addressLine1: varchar('address_line1', { length: 200 }),
    addressLine2: varchar('address_line2', { length: 200 }),
    city: varchar('city', { length: 100 }),
    state: varchar('state', { length: 100 }),
    postalCode: varchar('postal_code', { length: 12 }),
    country: varchar('country', { length: 100 }),
    phone: varchar('phone', { length: 32 }),
    email: varchar('email', { length: 255 }),
    website: varchar('website', { length: 255 }),
    // Clinical establishment / hospital registration number.
    registrationNumber: varchar('registration_number', { length: 100 }),
    // GSTIN — 15 characters, validated at the edge, stored uppercase.
    gstin: varchar('gstin', { length: 15 }),
    // Optimistic locking, same shape as tenant_branding.
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One organization-level profile per tenant.
    tenantUnique: unique('organization_profile_tenant_unique').on(t.tenantId),
  }),
);

export type OrganizationProfile = typeof organizationProfile.$inferSelect;
export type NewOrganizationProfile = typeof organizationProfile.$inferInsert;
