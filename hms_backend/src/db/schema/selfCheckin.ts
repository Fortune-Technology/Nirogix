import { pgTable, uuid, varchar, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { patients } from './patients';
import { appointments } from './appointments';
import { visits } from './visits';

/**
 * A patient announcing that they have arrived (ADR-118).
 *
 * **This is an announcement, not a check-in.** The distinction is the whole design, and it comes
 * straight from ADR-056: the product has exactly one unauthenticated write path per surface, none of
 * them writes to a clinical table, and a public submission creates a record for a human to review.
 * A visit is a clinical record — it carries a queue token, opens an invoice, and is what a
 * consultation hangs off — so a stranger with a QR code does not get to create one.
 *
 * What this buys is still most of the value. The patient does the queueing at a kiosk or on their
 * own phone; the front desk's work drops from a full check-in form to one click, because the
 * appointment already says who the patient is, which doctor, and which department. The desk
 * confirming is also the identity check: they are looking at the person.
 *
 * Everything on this row except `tenant_id` is **a claim until the desk confirms it**. The matched
 * patient and appointment are resolved server-side to make that one click possible, not because the
 * submission is trusted.
 */
export const selfCheckinRequests = pgTable(
  'self_checkin_requests',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    /**
     * The appointment this announcement was matched to, and the patient on it. Both nullable: an
     * announcement that matched nothing is still recorded, because "somebody tried to check in and
     * we could not find them" is exactly what the desk needs to see — and because an endpoint that
     * only stored successes would answer "does this number exist here?" through its own side
     * effects.
     */
    appointmentId: uuid('appointment_id').references(() => appointments.id, {
      onDelete: 'set null',
    }),
    patientId: uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }),

    /**
     * What the visitor typed. Kept as typed, never trusted, and deliberately not normalised into
     * the patient record — it is evidence about the announcement, not a correction to a chart.
     */
    claimedPhone: varchar('claimed_phone', { length: 32 }).notNull(),

    /** `pending` | `confirmed` | `dismissed`. */
    status: varchar('status', { length: 16 }).notNull().default('pending'),

    announcedAt: timestamp('announced_at', { withTimezone: true }).notNull().defaultNow(),

    /** Set when the desk turns the announcement into a real check-in. */
    resultingVisitId: uuid('resulting_visit_id').references(() => visits.id, {
      onDelete: 'set null',
    }),
    confirmedBy: uuid('confirmed_by'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    /** Why the desk dismissed it — "nobody came to the counter", "already checked in by hand". */
    dismissReason: varchar('dismiss_reason', { length: 300 }),

    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The desk's board: today's pending announcements for this hospital.
    index('self_checkin_requests_tenant_status_idx').on(t.tenantId, t.status, t.announcedAt),
  ],
);

export type SelfCheckinRequestRow = typeof selfCheckinRequests.$inferSelect;
