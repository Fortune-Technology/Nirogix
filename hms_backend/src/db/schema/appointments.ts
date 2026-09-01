import { pgTable, uuid, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { patients } from './patients';
import { providers } from './providers';
import { departments } from './departments';

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
  // The department the appointment is booked into (ADR-115). Nullable, like a visit's, because a
  // small clinic books a doctor rather than a department. Present so that ONE form can ask the
  // same questions whether the answer is "now" or "next Tuesday" — a field that existed on only
  // one of the two was the reason the two forms could not be the same form.
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'restrict' }),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  durationMinutes: integer('duration_minutes').notNull().default(15),
  // booked | cancelled | completed | no_show
  status: varchar('status', { length: 20 }).notNull().default('booked'),
  /**
   * Why the patient is coming (ADR-115): `appointment` for a first visit with this doctor,
   * `follow_up` for a return. Chosen when the appointment is booked and copied onto the visit at
   * check-in, so the distinction survives the wait instead of having to be remembered at the desk
   * a week later. It is also what a follow-up consultation fee would be priced from.
   */
  arrivalType: varchar('arrival_type', { length: 20 }).notNull().default('appointment'),
  // Same length as `visits.reason` (ADR-113): it is the same chief complaint, typed into the same
  // field of the same form, and a limit that depends on which button was pressed is a trap.
  reason: varchar('reason', { length: 2000 }),
  cancelReason: varchar('cancel_reason', { length: 300 }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
