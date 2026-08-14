import { pgTable, uuid, varchar, integer, date, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { patients } from './patients';
import { providers } from './providers';
import { appointments } from './appointments';

// Visit / encounter (OPD & Check-in, development-plan §11). The record that a consultation, and
// later every order and charge, hangs off. Created at check-in. `token_number` is the day's
// queue token for the branch; `visit_number` is a tenant-monotonic id. `invoice_id` is a soft
// link to the draft consultation-fee invoice created at check-in (no FK — avoids a cycle with
// invoices.visit_id). Tenant-scoped → RLS applies automatically.
export const visits = pgTable(
  'visits',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id'), // NULL = org-wide
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),
    providerId: uuid('provider_id').references(() => providers.id, { onDelete: 'restrict' }), // nullable — walk-in may not have a doctor assigned yet
    appointmentId: uuid('appointment_id').references(() => appointments.id, { onDelete: 'set null' }), // nullable — walk-ins have no appointment
    invoiceId: uuid('invoice_id'), // soft link to the consultation-fee invoice
    visitNumber: varchar('visit_number', { length: 32 }).notNull(),
    tokenNumber: integer('token_number').notNull(),
    visitDate: date('visit_date').notNull(),
    visitType: varchar('visit_type', { length: 20 }).notNull().default('opd'),
    department: varchar('department', { length: 80 }),
    status: varchar('status', { length: 20 }).notNull().default('checked_in'), // checked_in | in_consultation | completed | cancelled
    reason: varchar('reason', { length: 500 }),
    checkedInBy: uuid('checked_in_by'),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('visits_tenant_number_unique').on(t.tenantId, t.visitNumber)],
);

export type Visit = typeof visits.$inferSelect;
export type NewVisit = typeof visits.$inferInsert;
