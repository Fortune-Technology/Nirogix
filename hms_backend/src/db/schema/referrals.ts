import { pgTable, uuid, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { patients } from './patients';
import { visits } from './visits';
import { providers } from './providers';
import { departments } from './departments';

/**
 * In-hospital referrals (ADR-068): the doctor sends the patient onward to another
 * department — cardiology to orthopaedics, OPD to physiotherapy — and the receiving
 * side works a queue of what has been sent to it.
 *
 * A referral is a POINTER between visits, not a clinical record: the notes stay on the
 * encounters, the money on the invoices. `visit_id` is where the patient was referred
 * FROM; `resulting_visit_id` is set when the front desk checks the patient in against
 * the referral, which is also what completes it — "information transferred" means the
 * receiving department opens the same chart, not a copy.
 *
 * pending → completed | cancelled. Nothing deletes; a mistaken referral is cancelled.
 */
export const referrals = pgTable(
  'referrals',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    visitId: uuid('visit_id')
      .notNull()
      .references(() => visits.id, { onDelete: 'restrict' }),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),
    fromProviderId: uuid('from_provider_id').references(() => providers.id, {
      onDelete: 'set null',
    }),
    toDepartmentId: uuid('to_department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'restrict' }),
    /** Optional: a specific doctor in that department. */
    toProviderId: uuid('to_provider_id').references(() => providers.id, { onDelete: 'set null' }),
    reason: varchar('reason', { length: 500 }).notNull(),
    // pending | completed | cancelled
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    /** The visit the receiving department opened for this referral (set on check-in). */
    resultingVisitId: uuid('resulting_visit_id'),
    createdBy: uuid('created_by'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byTenantStatus: index('referrals_tenant_status_idx').on(t.tenantId, t.status) }),
);

export type Referral = typeof referrals.$inferSelect;
