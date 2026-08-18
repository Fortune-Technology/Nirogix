import { pgTable, uuid, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { patients } from './patients';
import { providers } from './providers';

// An appointment — a patient booked with a provider at a time. Tenant-scoped (RLS). Double-booking
// is prevented at the service layer (no overlapping `booked` appointment for the same provider).
// Cancelling sets status = 'cancelled', which frees the slot. See resources/phases.md → MVP 0.
export const appointments = pgTable('appointments', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  branchId: uuid('branch_id'),
  patientId: uuid('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'restrict' }),
  providerId: uuid('provider_id')
    .notNull()
    .references(() => providers.id, { onDelete: 'restrict' }),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  durationMinutes: integer('duration_minutes').notNull().default(15),
  // booked | cancelled | completed | no_show
  status: varchar('status', { length: 20 }).notNull().default('booked'),
  reason: varchar('reason', { length: 300 }),
  cancelReason: varchar('cancel_reason', { length: 300 }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
