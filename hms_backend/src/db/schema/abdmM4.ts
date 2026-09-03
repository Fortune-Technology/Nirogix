import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { branches } from './branches';
import { providers } from './providers';

/**
 * ABDM Milestone 4 — the national registries (ADR-096).
 *
 * M1–M3 move identity and clinical data. M4 moves **no patient data at all**: it lists the hospital
 * itself in the Health Facility Registry and its clinicians in the Healthcare Professional Registry.
 * Different obligations, and the table below reflects them — nothing here is a clinical record, so
 * the aggressive-deletion rules of M3 do not apply and the ordinary invariant does: these rows are
 * kept.
 *
 * **Tenant-scoped with a nullable `branch_id`**, exactly like `abdm_facility_config`. Nirogix is
 * multi-tenant: every hospital registers its own facility, and a group with several branches
 * registers several. The brief this was built from assumed a single in-house hospital, which would
 * have produced one global row and made the feature unusable for every tenant after the first.
 *
 * The registration is a **wizard**, not a call. HFR issues a `trackingId` on the first step and the
 * remaining three quote it; approval is a human review afterwards. So the row exists long before a
 * facility id does, and `facility_id` stays null until a verifier says otherwise.
 */
export const abdmFacilityRegistry = pgTable(
  'abdm_facility_registry',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    /** NULL = the organisation's principal facility; set = one branch of a group. */
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),

    /**
     * HFR's handle for an in-progress registration, returned by `basic-information` and quoted by
     * every later step. It is the reason this row exists before a facility id does.
     */
    trackingId: varchar('tracking_id', { length: 64 }),

    /**
     * The HFR-issued Facility ID — null until a verifier approves.
     *
     * This is the same value `abdm_facility_config.hipId` holds, which is today typed by hand. Once
     * issued it should populate that field rather than sitting beside it: two ideas of "which
     * facility are we" is a bug waiting for a busy afternoon.
     */
    facilityId: varchar('facility_id', { length: 64 }),

    /**
     * draft → submitted → under_review → verified | rejected.
     *
     * HFR registrations go through a human verifier (the HFR SOP), so `submitted` is emphatically
     * not `verified` and the UI must not imply otherwise.
     */
    status: varchar('status', { length: 24 }).notNull().default('draft'),
    /** The registry's own words when it rejects — shown to the administrator verbatim. */
    statusMessage: text('status_message'),

    facilityName: varchar('facility_name', { length: 200 }).notNull(),
    ownershipCode: varchar('ownership_code', { length: 32 }),
    facilityTypeCode: varchar('facility_type_code', { length: 32 }),
    systemOfMedicineCode: varchar('system_of_medicine_code', { length: 32 }),
    stateLgdCode: varchar('state_lgd_code', { length: 16 }),
    districtLgdCode: varchar('district_lgd_code', { length: 16 }),
    pincode: varchar('pincode', { length: 10 }),

    /**
     * The full payload as last submitted.
     *
     * Kept because HFR's wizard is stateful on their side and ours: an administrator who returns a
     * week later to fix a rejection needs the form repopulated, and re-deriving forty fields from
     * six columns would lose most of it. It holds facility details only — address, ownership,
     * services, timings — and never a person.
     */
    payload: jsonb('payload'),

    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One registration per facility. A branch is a facility; NULL branch is the organisation's own.
    //
    // `nullsNotDistinct` is load-bearing, not decoration: PostgreSQL treats NULLs as DISTINCT in a
    // unique constraint by default, so the plain form would have allowed unlimited rows for exactly
    // the commonest case — a single-site hospital, whose `branch_id` is NULL. The upsert would then
    // never find a conflict to update and would duplicate on every save.
    tenantBranchUnique: unique('abdm_facility_registry_tenant_branch_unique')
      .on(t.tenantId, t.branchId)
      .nullsNotDistinct(),
    trackingIdx: index('abdm_facility_registry_tracking_idx').on(t.trackingId),
    statusIdx: index('abdm_facility_registry_status_idx').on(t.tenantId, t.status),
  }),
);

/**
 * A clinician's listing in the Healthcare Professional Registry (ADR-097).
 *
 * One row per provider who enrols. The enrolment is a chain of verifications — dedup, Aadhaar,
 * mobile, then the professional profile — and each step can be days apart, so the row records
 * *where the person got to* rather than only whether they finished.
 *
 * **No Aadhaar number is stored, ever.** The same rule as M1's patient flow and for the same reason:
 * the number is encrypted, sent, and forgotten. What survives is ABDM's own `txn_id`, which is a
 * reference to a verification they hold — useless to anyone who steals this table.
 *
 * `registration_number` and `hpr_id` are *not* secrets. A doctor's council registration number is
 * printed on their prescriptions and an HPR id is designed to be public. They are ordinary tenant
 * data behind the ordinary permission, and treating them as secrets would only make the feature
 * harder to use without making anyone safer.
 */
export const abdmStaffHpr = pgTable(
  'abdm_staff_hpr',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    /** The clinician on our side. Restrict: an enrolment must not outlive the person silently. */
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'restrict' }),

    /** ABDM's id for this professional. Public by design, not a secret. */
    hprId: varchar('hpr_id', { length: 64 }),
    /** The address form, e.g. `name@hpr.abdm`. */
    hprAddress: varchar('hpr_address', { length: 120 }),

    /**
     * not_started → aadhaar_verified → mobile_verified → registered, with `already_registered` for
     * somebody the dedup check found before we started.
     */
    status: varchar('status', { length: 24 }).notNull().default('not_started'),
    statusMessage: text('status_message'),

    /**
     * ABDM's handle for the verification in flight. **Never an Aadhaar number** — this is the whole
     * point of the design: a stolen copy of this table proves nothing about anybody's identity.
     */
    txnId: varchar('txn_id', { length: 128 }),
    txnStartedAt: timestamp('txn_started_at', { withTimezone: true }),

    professionalCategory: varchar('professional_category', { length: 24 }),
    registrationCouncil: varchar('registration_council', { length: 120 }),
    registrationNumber: varchar('registration_number', { length: 64 }),
    systemOfMedicine: varchar('system_of_medicine', { length: 64 }),

    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerUnique: unique('abdm_staff_hpr_provider_unique').on(t.tenantId, t.providerId),
    hprIdx: index('abdm_staff_hpr_hpr_idx').on(t.hprId),
    statusIdx: index('abdm_staff_hpr_status_idx').on(t.tenantId, t.status),
  }),
);

export type AbdmFacilityRegistry = typeof abdmFacilityRegistry.$inferSelect;
export type AbdmStaffHpr = typeof abdmStaffHpr.$inferSelect;
