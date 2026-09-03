import { pgTable, uuid, varchar, date, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { patients } from './patients';
import { users } from './users';

// Patient immunisations (ADR-072 consumer): the concrete record that makes the vaccine catalogue
// useful. A row snapshots the vaccine that was given (its code + name at the time), so a later
// rename in the catalogue never rewrites history. `vaccine_code` points at either a system
// catalogue code (e.g. BCG) or a hospital custom code (CUSTOM_…); `source` records which.
// Tenant-scoped → automatic RLS.
export const patientImmunizations = pgTable('patient_immunizations', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  patientId: uuid('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  vaccineCode: varchar('vaccine_code', { length: 64 }).notNull(),
  vaccineName: varchar('vaccine_name', { length: 200 }).notNull(),
  source: varchar('source', { length: 10 }).notNull().default('system'), // system | custom
  dateGiven: date('date_given').notNull(),
  doseLabel: varchar('dose_label', { length: 60 }),
  notes: text('notes'),
  recordedByUserId: uuid('recorded_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PatientImmunization = typeof patientImmunizations.$inferSelect;
