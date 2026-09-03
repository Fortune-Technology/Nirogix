import { pgTable, uuid, varchar, integer, date, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { patients } from './patients';
import { providers } from './providers';
import { appointments } from './appointments';
import { departments } from './departments';
import { patientCases } from './cases';

// Visit / encounter (OPD & Check-in, development-plan §11). The record that a consultation, and
// later every order and charge, hangs off. Created at check-in. `token_number` is the day's
// queue token for the branch; `visit_number` is a tenant-monotonic id. `invoice_id` is a soft
// link to the draft consultation-fee invoice created at check-in (no FK — avoids a cycle with
// invoices.visit_id). Tenant-scoped → RLS applies automatically.
export const visits = pgTable(
  'visits',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id'), // NULL = org-wide
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),
    providerId: uuid('provider_id').references(() => providers.id, { onDelete: 'restrict' }), // nullable — walk-in may not have a doctor assigned yet
    appointmentId: uuid('appointment_id').references(() => appointments.id, {
      onDelete: 'set null',
    }), // nullable — walk-ins have no appointment
    invoiceId: uuid('invoice_id'), // soft link to the consultation-fee invoice
    /**
     * What the fee schedule said this consultation costs (ADR-117), kept even when the desk
     * charged something else. The invoice holds what was actually billed; this holds what should
     * have been, and the gap between the two is the whole point of recording an override.
     */
    calculatedFeePaise: integer('calculated_fee_paise'),
    /**
     * Why the desk charged something other than the calculated fee. Required whenever the two
     * differ, because "₹200 instead of ₹600" with no reason is indistinguishable from a mistake.
     */
    feeOverrideReason: varchar('fee_override_reason', { length: 300 }),
    /**
     * The treatment case this visit belongs to (ADR-116). Nullable, and it stays nullable: a
     * one-off consultation is not an episode, and forcing every walk-in to open a case would fill
     * the chart with cases of one visit that nobody ever closes.
     */
    caseId: uuid('case_id').references(() => patientCases.id, { onDelete: 'restrict' }),
    visitNumber: varchar('visit_number', { length: 32 }).notNull(),
    tokenNumber: integer('token_number').notNull(),
    visitDate: date('visit_date').notNull(),
    visitType: varchar('visit_type', { length: 20 }).notNull().default('opd'),
    /**
     * How the patient arrived (ADR-115): `walk_in`, `appointment` or `follow_up`.
     *
     * Deliberately NOT folded into `visit_type`, which answers a different question — where the
     * patient is being treated (`opd` today, inpatient later). Conflating "where" with "how they
     * got here" would make both unusable: an OPD follow-up is both, and a value can only be one.
     *
     * Defaults to `walk_in` because that is what an undirected check-in is. A check-in against a
     * booked appointment sets `appointment` server-side rather than trusting the caller.
     */
    arrivalType: varchar('arrival_type', { length: 20 }).notNull().default('walk_in'),
    /**
     * What kind of consultation this is (ADR-121), in the hospital's own vocabulary from
     * `hospital_workflow_config.consultation_types`.
     *
     * A third question, distinct from the two above: `visit_type` is where the patient is being
     * treated, `arrival_type` is how they got here, and this is what is about to happen to them.
     * A teleconsultation and a dressing change are both OPD walk-ins and are not the same
     * consultation, and a hospital charging differently for them needs somewhere to say so.
     *
     * Nullable, and stays nullable — a hospital that has configured no vocabulary has nothing to
     * pick from, and every visit before ADR-121 legitimately has no answer.
     */
    consultationType: varchar('consultation_type', { length: 40 }),
    // `department` is the original free-text field and stays for the visits that already carry
    // one — dropping it would rewrite history. New check-ins set `departmentId` instead, and the
    // service writes the department's name into `department` too so existing reads keep working
    // (ADR-050). The text column is deprecated; it goes when no row needs it.
    department: varchar('department', { length: 80 }),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 20 }).notNull().default('checked_in'), // checked_in | in_consultation | completed | cancelled
    // The chief complaint in the patient's own words. Long enough for the sentences a desk
    // actually types ("chest pain since 3 days, worse on exertion, no breathlessness"), which
    // 500 characters was not (ADR-113).
    reason: varchar('reason', { length: 2000 }),
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
