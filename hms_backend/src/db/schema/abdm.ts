import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, index, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { patients } from './patients';

/**
 * ABDM (Ayushman Bharat Digital Mission) integration — Milestone 1 only (ADR-084).
 *
 * M1 is ABHA **creation and verification at registration**: the front desk proves who the
 * patient is through NHA rather than by typing a form. M2 (HIP — linking care contexts) and
 * M3 (HIU — consented record fetch) are deliberately absent; they need a separate legal and
 * compliance review before any code exists (resources/development-plan.md §36).
 *
 * Two rules shape both tables below and must not be relaxed:
 *
 * 1. **A raw Aadhaar number is never persisted.** It exists in memory for the length of one
 *    encrypt → request-OTP call and is then gone. What survives is a masked hint
 *    (`XXXXXXXX1234`), which is enough for a receptionist to recognise the transaction and
 *    useless to anyone who steals the table. The same holds for OTPs.
 * 2. **Every ABDM token is encrypted at rest** (`security/encryption.ts`, AES-256-GCM). A
 *    linking token is a bearer credential against a real person's national health identity;
 *    a plaintext column is a breach waiting for a `SELECT`.
 */

/**
 * The hospital's own ABDM facility identity, per tenant.
 *
 * ABDM issues **one** client id/secret to the *application* (Nirogix, registered with NHA) and
 * a **separate** HFR facility id to each *hospital*. The credential therefore lives in server
 * configuration, and the facility id — which is what the gateway routes on, and what a patient's
 * PHR app resolves when it scans the QR — lives here, per tenant. Without a row here a tenant
 * simply has no Scan-and-Share; that is a configuration state, not an error.
 */
export const abdmFacilityConfig = pgTable(
  'abdm_facility_config',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    /** NULL = the whole organization; set = this branch registers under its own HFR facility. */
    branchId: uuid('branch_id'),
    /** HFR facility id, sent as the X-HIP-ID header. Issued by NHA, not by us. */
    hipId: varchar('hip_id', { length: 64 }).notNull(),
    facilityName: varchar('facility_name', { length: 200 }),
    /** Verbatim QR payload from the HFR facility record; rendered as the Scan-and-Share QR. */
    qrContent: text('qr_content'),
    /** Off until the hospital confirms its HFR registration is live. */
    scanShareEnabled: boolean('scan_share_enabled').notNull().default(false),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantBranchUnique: unique('abdm_facility_config_tenant_branch_unique').on(t.tenantId, t.branchId),
  }),
);

/**
 * One ABDM conversation — OTP request through to a linked patient record.
 *
 * Every M1 flow (create by Aadhaar, the secondary mobile check, login by ABHA number / ABHA
 * address / mobile / Aadhaar, and Scan-and-Share) is the same shape: a `txnId` held by ABDM, a
 * short-lived state on our side, and a profile at the end. Modelling them as one table means
 * the audit trail, the expiry sweep and the consent record are written once rather than five
 * times.
 *
 * Tenant-scoped, so it inherits the RLS policy: one hospital can never read another's
 * verification traffic. Rows are retained (never hard-deleted) because they are the evidence
 * that consent was taken before an Aadhaar OTP was triggered.
 */
export const abdmTransactions = pgTable(
  'abdm_transactions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    branchId: uuid('branch_id'),
    /** ABDM's transaction id. Absent for scan_share, which arrives unsolicited. */
    txnId: varchar('txn_id', { length: 64 }),
    /**
     * enrol_aadhaar | enrol_mobile | enrol_address | login_abha_number | login_abha_address
     * | login_mobile | login_aadhaar | scan_share
     */
    flow: varchar('flow', { length: 32 }).notNull(),
    /** otp_sent | verified | completed | failed | expired | consumed */
    state: varchar('state', { length: 16 }).notNull().default('otp_sent'),
    /**
     * Masked identifier ONLY — `XXXXXXXX1234` for Aadhaar, `XXXXXX7890` for mobile. The raw
     * value is never written here, and a check constraint in the migration refuses any value
     * that looks like 12 consecutive digits.
     */
    identifierHint: varchar('identifier_hint', { length: 32 }),
    /** Verified ABHA identifiers, once the flow returns them. */
    abhaNumber: varchar('abha_number', { length: 20 }),
    abhaAddress: varchar('abha_address', { length: 80 }),
    /** Demographics returned by ABDM, used to pre-fill and to match. Never contains Aadhaar. */
    profile: jsonb('profile'),
    /** Encrypted at rest (AES-256-GCM). Bearer credential — never returned to a browser. */
    linkingTokenEnc: text('linking_token_enc'),
    /**
     * The profile-scoped `X-token` for this ABHA holder, encrypted. Needed by the calls that
     * come *after* verification — the ABHA card download and picking one account out of several
     * — so it is held for the life of the transaction and never longer.
     */
    xTokenEnc: text('x_token_enc'),
    /** When the operator recorded the patient's consent. NOT NULL for any Aadhaar flow. */
    consentAt: timestamp('consent_at', { withTimezone: true }),
    consentVersion: varchar('consent_version', { length: 16 }),
    /** The patient record this transaction ended up on, once matched or created. */
    patientId: uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }),
    /** Whether the match was against an existing chart or a new one — the M1 test case. */
    matchOutcome: varchar('match_outcome', { length: 16 }), // returning | new | ambiguous
    /** ABDM error code/message when the flow failed, for support without re-running it. */
    failureCode: varchar('failure_code', { length: 64 }),
    initiatedBy: uuid('initiated_by'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTxn: index('abdm_transactions_txn_idx').on(t.tenantId, t.txnId),
    byState: index('abdm_transactions_state_idx').on(t.tenantId, t.state),
    byAbha: index('abdm_transactions_abha_idx').on(t.tenantId, t.abhaNumber),
  }),
);

export type AbdmFacilityConfig = typeof abdmFacilityConfig.$inferSelect;
export type AbdmTransaction = typeof abdmTransactions.$inferSelect;
export type NewAbdmTransaction = typeof abdmTransactions.$inferInsert;
