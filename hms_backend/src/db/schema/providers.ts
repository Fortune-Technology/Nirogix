import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  jsonb,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { branches } from './branches';
import { users } from './users';

// FHIR-aligned specialty-agnostic core (ADR-008). Core clinical entities stay strongly typed
// (no EAV); specialty variation is captured by data (practitioner_roles, specialty_form_templates),
// so adding a specialty is a data change, not a schema migration.

// FHIR Practitioner — a person with clinical qualifications. May or may not be a login `user`
// (external/visiting doctors have no login). Tenant-scoped (RLS).
export const providers = pgTable('providers', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  fullName: varchar('full_name', { length: 200 }).notNull(),
  gender: varchar('gender', { length: 20 }),
  // Medical council registration number (FHIR Practitioner.qualification / identifier).
  registrationNumber: varchar('registration_number', { length: 100 }),
  qualification: varchar('qualification', { length: 200 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 32 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Specialty catalog — maintained as DATA, global (same code system for every tenant), seeded from
// code. Specialty-specific fields map to SNOMED CT where applicable. No tenant_id / no RLS.
export const specialties = pgTable('specialties', {
  code: varchar('code', { length: 50 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  snomedCode: varchar('snomed_code', { length: 20 }),
});

// FHIR PractitionerRole — links a provider to a specialty + branch (location) + role. Adding a
// specialty to a provider is an INSERT here, never a schema change. Tenant-scoped (RLS).
export const practitionerRoles = pgTable(
  'practitioner_roles',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    specialtyCode: varchar('specialty_code', { length: 50 }).notNull(),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    role: varchar('role', { length: 50 }).notNull().default('consultant'),
    isPrimary: boolean('is_primary').notNull().default(false),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: unique('practitioner_roles_unique').on(t.providerId, t.specialtyCode, t.branchId),
  }),
);

// Admin-configurable form templates for structured data that genuinely varies by specialty
// (dental charting, dialysis session params, etc.) — the `schema` jsonb holds field definitions.
// This is the sanctioned alternative to EAV on core entities. Tenant-scoped (RLS).
export const specialtyFormTemplates = pgTable(
  'specialty_form_templates',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    specialtyCode: varchar('specialty_code', { length: 50 }), // null = general/any specialty
    key: varchar('key', { length: 100 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    schema: jsonb('schema').notNull(),
    version: integer('version').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniq: unique('specialty_form_templates_unique').on(t.tenantId, t.key) }),
);

export type Provider = typeof providers.$inferSelect;
export type Specialty = typeof specialties.$inferSelect;
export type PractitionerRole = typeof practitionerRoles.$inferSelect;
export type SpecialtyFormTemplate = typeof specialtyFormTemplates.$inferSelect;
