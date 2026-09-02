import { pgTable, uuid, varchar, integer, text, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { branches } from './branches';
import { patients } from './patients';
import { providers } from './providers';
import { departments } from './departments';

/**
 * A treatment case — the episode a run of visits belongs to (ADR-116).
 *
 * The largest clinical unit the product had was the visit, which meant a patient being treated for
 * a fracture over six weeks was six unrelated rows. Nothing tied a follow-up to what it followed:
 * `arrival_type: follow_up` (ADR-115) records *that* a visit is a return, and could not record
 * *what it returns to*. This is what it returns to.
 *
 * **A patient may have several open cases at once**, and that is not a data-quality problem — a
 * diabetic being managed long-term who breaks an ankle has two, treated by different doctors on
 * different schedules. So opening a second case is never refused. What the product does instead is
 * make the existing ones impossible to miss at the moment a new one would be opened, which is where
 * accidental duplicates actually come from.
 *
 * **Never deleted** (invariant #6). A case closes; a case opened by mistake is closed with a reason
 * that says so. The visits under it are real clinical records either way.
 */
export const patientCases = pgTable(
  'patient_cases',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'restrict' }),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),

    /** Tenant-monotonic, `C-000001`. What staff say out loud, the way `V-` numbers already are. */
    caseNumber: varchar('case_number', { length: 32 }).notNull(),

    /**
     * What the case is about, in the words the desk and the patient would both recognise —
     * "Fracture right tibia", "Antenatal care", "Diabetes management". Deliberately free text and
     * deliberately NOT a diagnosis: a case is opened at the front desk before anyone has examined
     * the patient, and forcing an ICD-10 code there would either block check-in or fill the chart
     * with guesses. The coded diagnosis lives on the encounter, where a clinician makes it.
     */
    title: varchar('title', { length: 200 }).notNull(),

    /** Where the case is being run. Both nullable, and both only ever a default for a new visit. */
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'restrict' }),
    providerId: uuid('provider_id').references(() => providers.id, { onDelete: 'restrict' }),

    /**
     * What kind of episode this is (ADR-121), from `hospital_workflow_config.case_types` —
     * "General", "Corporate", "Insurance", "Camp", "Medico-legal".
     *
     * Deliberately on the **case** and not the visit. A corporate arrangement, an insurance
     * claim or a medico-legal case is a property of the episode, and putting it on each visit
     * would invite the third follow-up to be recorded as something the first two were not. It
     * prices every visit under the case, which is what a hospital means by a corporate rate.
     */
    caseType: varchar('case_type', { length: 40 }),

    /** `open` | `closed`. A closed case can be reopened — treatment resumes, and people mis-click. */
    status: varchar('status', { length: 16 }).notNull().default('open'),

    notes: text('notes'),

    openedBy: uuid('opened_by'),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedBy: uuid('closed_by'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    /** Why it closed. Required to close, because "closed" without a reason is unreadable later. */
    closeReason: varchar('close_reason', { length: 300 }),

    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('patient_cases_tenant_number_unique').on(t.tenantId, t.caseNumber),
    // The question asked on every check-in: "what is already open for this patient?"
    index('patient_cases_patient_idx').on(t.tenantId, t.patientId, t.status),
  ],
);

export type PatientCaseRow = typeof patientCases.$inferSelect;
