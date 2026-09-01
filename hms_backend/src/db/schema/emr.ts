import { pgTable, uuid, varchar, integer, text, boolean, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { patients } from './patients';
import { providers } from './providers';
import { visits } from './visits';

// Clinical Workflow / EMR (development-plan §12). One encounter per OPD visit: SOAP notes +
// strongly-typed vitals (invariant #5 — core clinical entities are typed columns, never EAV),
// with ICD-10 diagnoses, prescriptions and lab orders hanging off it. Vitals use integer units
// to stay exact (temp in tenths of °C, weight in grams) — the frontend converts for display.
// `status` draft → signed; once signed the encounter is locked and its prescriptions / lab
// orders become the stable input queue for Pharmacy (1.5) and Lab (1.6). All tenant-scoped → RLS.
export const encounters = pgTable(
  'encounters',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    visitId: uuid('visit_id')
      .notNull()
      .references(() => visits.id, { onDelete: 'restrict' }),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),
    providerId: uuid('provider_id').references(() => providers.id, { onDelete: 'restrict' }),
    chiefComplaint: varchar('chief_complaint', { length: 500 }),
    // SOAP note
    subjective: text('subjective'),
    objective: text('objective'),
    assessment: text('assessment'),
    plan: text('plan'),
    // Vitals live in `patient_vitals`, not here (ADR-113). They have to be recordable before a
    // consultation exists — at the desk, or in a nurse's queue — and a consultation cannot exist
    // until the payment gate is satisfied, so columns on this row could never hold them.
    status: varchar('status', { length: 20 }).notNull().default('draft'), // draft | signed
    authoredBy: uuid('authored_by'),
    version: integer('version').notNull().default(1),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('encounters_tenant_visit_unique').on(t.tenantId, t.visitId)],
);

export const diagnoses = pgTable('diagnoses', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  encounterId: uuid('encounter_id')
    .notNull()
    .references(() => encounters.id, { onDelete: 'cascade' }),
  icd10Code: varchar('icd10_code', { length: 10 }).notNull(),
  icd10Term: varchar('icd10_term', { length: 300 }).notNull(),
  isPrimary: boolean('is_primary').notNull().default(false),
  notes: varchar('notes', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const prescriptions = pgTable('prescriptions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  encounterId: uuid('encounter_id')
    .notNull()
    .references(() => encounters.id, { onDelete: 'cascade' }),
  visitId: uuid('visit_id').notNull(),
  patientId: uuid('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'restrict' }),
  drugName: varchar('drug_name', { length: 200 }).notNull(),
  // Drug-master link (plain uuid, no FK — pharmacy imports this table for dispenses, an FK back
  // would cycle the schema modules). Validated in the service; drug_name stays the snapshot.
  drugId: uuid('drug_id'),
  dose: varchar('dose', { length: 80 }),
  frequency: varchar('frequency', { length: 80 }),
  duration: varchar('duration', { length: 80 }),
  route: varchar('route', { length: 40 }),
  instructions: varchar('instructions', { length: 500 }),
  status: varchar('status', { length: 20 }).notNull().default('ordered'), // ordered | dispensed | cancelled
  prescribedBy: uuid('prescribed_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const labOrders = pgTable('lab_orders', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  encounterId: uuid('encounter_id')
    .notNull()
    .references(() => encounters.id, { onDelete: 'cascade' }),
  visitId: uuid('visit_id').notNull(),
  patientId: uuid('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'restrict' }),
  testName: varchar('test_name', { length: 200 }).notNull(),
  // Test-master link (plain uuid, no FK — lab_results already references lab_orders, an FK back
  // to lab_tests would cycle the schema modules). Validated in the service; name is the snapshot,
  // and this is what prices the order at sample collection.
  testId: uuid('test_id'),
  testCode: varchar('test_code', { length: 40 }),
  priority: varchar('priority', { length: 20 }).notNull().default('routine'), // routine | urgent
  status: varchar('status', { length: 20 }).notNull().default('ordered'), // ordered | collected | resulted | verified | cancelled
  notes: varchar('notes', { length: 500 }),
  orderedBy: uuid('ordered_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Encounter = typeof encounters.$inferSelect;
export type NewEncounter = typeof encounters.$inferInsert;
export type Diagnosis = typeof diagnoses.$inferSelect;
export type Prescription = typeof prescriptions.$inferSelect;
export type LabOrder = typeof labOrders.$inferSelect;
