import { pgTable, uuid, varchar, integer, text, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { branches } from './branches';
import { patients } from './patients';
import { visits } from './visits';

/**
 * Per-hospital workflow configuration (ADR-113).
 *
 * Hospitals run the same clinical workflow in genuinely different orders — one takes vitals at the
 * front desk while the patient registers, another sends them to a nurse's room first, a third only
 * ever records them in the consultation. None of those is more correct than the others, so none of
 * them belongs in code.
 *
 * **Resolution is branch-then-organization.** A row with `branch_id = NULL` is the organization's
 * default; a row naming a branch overrides it for that hospital only. A tenant with no row at all
 * gets the platform defaults, which are deliberately today's behaviour — an existing hospital that
 * never opens this screen sees nothing change.
 *
 * This table is the home for workflow settings generally, not just vitals. Settings are added here
 * as the workflow they configure is built; a toggle nothing reads is a promise the product does not
 * keep.
 */
export const hospitalWorkflowConfig = pgTable(
  'hospital_workflow_config',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    /** NULL = the organization's default, inherited by every hospital that has no row of its own. */
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'restrict' }),

    /**
     * Where in the workflow vitals are taken.
     *
     * - `disabled` — this hospital does not record vitals at all.
     * - `consultation_only` — the doctor records them during the consultation. **The default**,
     *   because it is what the product did before this table existed.
     * - `during_checkin` — the front desk records them on the check-in form itself.
     * - `after_checkin` — the patient joins a vitals queue between check-in and consultation, and a
     *   nurse or assistant records them there.
     *
     * In every mode except `disabled` the doctor can still amend vitals during the consultation —
     * a reading taken twenty minutes ago at a desk is not a reason to stop a clinician correcting it.
     */
    vitalsMode: varchar('vitals_mode', { length: 24 }).notNull().default('consultation_only'),
    /**
     * Which parameters the form insists on, and which it merely offers. Both hold parameter keys
     * from `VITAL_PARAMETERS` (`@hms/types`). A key in neither list is not shown.
     *
     * Stored as text arrays rather than a column per parameter: the set of vitals a hospital cares
     * about is configuration, and adding one must not be a migration. The *readings* stay strongly
     * typed in `patient_vitals` (invariant #5) — it is the choice of which to collect that is data.
     */
    vitalsRequiredParams: text('vitals_required_params').array().notNull().default(sql`'{}'::text[]`),
    vitalsOptionalParams: text('vitals_optional_params').array().notNull().default(sql`'{}'::text[]`),

    /**
     * The hospital's own words for what kind of consultation this is (ADR-121) — "First OPD",
     * "Review", "Teleconsultation", "Procedure room". Used as a pricing dimension in the fee
     * schedule and offered as a field at check-in.
     *
     * A vocabulary rather than an enum because there is no common one: a teaching hospital and a
     * corporate clinic mean entirely different things by "consultation type", and a fixed list
     * would be wrong for both. **Empty by default**, which means the field is not shown and the
     * dimension is inert — a hospital that never opens the screen sees no change.
     */
    consultationTypes: text('consultation_types').array().notNull().default(sql`'{}'::text[]`),
    /**
     * The same, for what kind of *episode* a treatment case is — "General", "Corporate",
     * "Insurance", "Camp", "Medico-legal". Set once when the case is opened, and it prices every
     * visit under that case: a corporate case does not stop being corporate on its third visit.
     */
    caseTypes: text('case_types').array().notNull().default(sql`'{}'::text[]`),

    /**
     * When the consultation fee has to be settled.
     *
     * - `before_consultation` — the doctor cannot open the consultation until the invoice is paid.
     *   **The default**, and what the product enforced before this setting existed.
     * - `at_checkin` — the same rule; the difference is that the desk is told to collect immediately
     *   rather than sending the patient to a counter. Enforcement is identical, so a hospital
     *   choosing this is describing its own process, not weakening the gate.
     * - `after_consultation` — no gate. The patient is seen and settles everything on the way out,
     *   which is how a hospital billing an employer or an insurer has to work.
     *
     * The gate is enforced server-side in the EMR service. This setting moves it; it is never read
     * by the frontend to decide whether to allow something.
     */
    paymentTiming: varchar('payment_timing', { length: 24 }).notNull().default('before_consultation'),

    // Optimistic locking, same shape as tenant_branding and organization_profile.
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One row per scope. `branch_id IS NULL` is a distinct scope from any branch, and Postgres
    // treats NULLs as distinct in a unique index — so the organization-level row is additionally
    // protected by the partial index below.
    unique('hospital_workflow_config_scope_unique').on(t.tenantId, t.branchId),
    index('hospital_workflow_config_tenant_idx').on(t.tenantId),
  ],
);

/**
 * A vitals observation (ADR-113).
 *
 * One row per set of readings taken at one moment by one person, against one visit. Not one row per
 * visit: the desk may take a blood pressure at check-in and the doctor may take it again twenty
 * minutes later, and a clinician reading the chart needs to see both, with who took each and when.
 * The consultation shows the latest.
 *
 * Readings are strongly typed columns in exact integer units (invariant #5 — no EAV on a core
 * clinical entity). Which of them a hospital collects is configuration and lives in
 * `hospital_workflow_config`; what a reading *is* is not configurable.
 *
 * This replaces the eight `vital_*` columns that used to live on `encounters`. They were unreachable
 * before a consultation existed, and a consultation cannot exist until the payment gate is
 * satisfied — so under the old shape a hospital could not record vitals at the front desk at all.
 */
export const patientVitals = pgTable(
  'patient_vitals',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'restrict' }),
    visitId: uuid('visit_id')
      .notNull()
      .references(() => visits.id, { onDelete: 'restrict' }),
    /** Denormalised from the visit so a patient's readings can be read across visits without a join. */
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),

    /**
     * Where in the workflow this reading was taken: `check_in`, `pre_consultation` (the vitals
     * queue) or `consultation`. Kept because "who measured this, and at what point" changes how a
     * clinician reads it — a desk reading on a patient who has just climbed stairs is not the same
     * observation as one taken in a quiet room.
     */
    stage: varchar('stage', { length: 20 }).notNull(),

    // Readings. NULL means not recorded — never zero, which is a real (and alarming) value.
    systolic: integer('systolic'), // mmHg
    diastolic: integer('diastolic'), // mmHg
    pulse: integer('pulse'), // bpm
    spo2: integer('spo2'), // %
    respRate: integer('resp_rate'), // breaths/min
    tempCTenths: integer('temp_c_tenths'), // 375 = 37.5 °C
    weightG: integer('weight_g'), // grams
    heightCm: integer('height_cm'), // cm
    bloodSugarMgDl: integer('blood_sugar_mg_dl'), // mg/dL
    /** Which reading the blood sugar is: `fasting`, `post_prandial` or `random`. */
    bloodSugarType: varchar('blood_sugar_type', { length: 16 }),

    notes: varchar('notes', { length: 500 }),

    recordedBy: uuid('recorded_by'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The consultation asks for "this visit's readings, newest first" on every open.
    index('patient_vitals_visit_idx').on(t.tenantId, t.visitId),
    // The chart asks for "this patient's readings over time" — a growth chart, a BP trend.
    index('patient_vitals_patient_idx').on(t.tenantId, t.patientId),
  ],
);

export type HospitalWorkflowConfigRow = typeof hospitalWorkflowConfig.$inferSelect;
export type PatientVitalsRow = typeof patientVitals.$inferSelect;
