import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { patients } from './patients';
import { providers } from './providers';

/**
 * ABDM Milestone 3 — being a Health Information USER (ADR-092).
 *
 * M2 answers other people's requests for our records. M3 is the other direction: our doctor asks a
 * patient for permission to read the history other hospitals hold, and — once granted — we pull,
 * decrypt and store somebody else's clinical data on our own disk.
 *
 * That last sentence is the whole reason these tables look the way they do. Every other clinical
 * table in this product holds records **we** created and must never lose (invariant #6). These hold
 * records **we borrowed**, under a permission that can be withdrawn at any moment, and which we have
 * contractually committed to destroying when it is. So the design is inverted:
 *
 * - **`abdm_hiu_records` is built to be deleted.** No `deleted_at`, no soft flag, no archive. A
 *   soft-delete column here would be a liability: it invites exactly the bug where the row is hidden
 *   and never purged, which is the failure the certification test looks for. Revocation issues a
 *   real `DELETE`, and the foreign key cascades from the consent so a purge cannot half-complete.
 * - **The audit trail lives elsewhere and is never deleted** — `audit_log` records that we requested,
 *   received and destroyed, with no clinical content in it. Proving compliance must not require
 *   keeping the very data we promised to destroy.
 * - **One request fans out into many consents.** If the patient's history sits at four hospitals,
 *   ABDM mints four artefacts, each with its own expiry and its own revocation. They are tracked
 *   individually because they die individually.
 */

/** Our outbound ask: one row per "fetch this patient's history" a doctor initiates. */
export const abdmHiuConsentRequests = pgTable(
  'abdm_hiu_consent_requests',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),
    abhaAddress: varchar('abha_address', { length: 80 }).notNull(),

    /**
     * The doctor asking, and the registration number the PATIENT will read in their app when
     * deciding whether to grant. Not decoration: it is the only thing identifying the human behind
     * the request, so it is captured at request time rather than joined later — a doctor who leaves
     * the hospital must not change what the patient was shown.
     */
    requesterProviderId: uuid('requester_provider_id').references(() => providers.id, { onDelete: 'set null' }),
    requesterName: varchar('requester_name', { length: 200 }).notNull(),
    requesterRegistrationNumber: varchar('requester_registration_number', { length: 100 }).notNull(),

    /** ABDM's id for the request, which arrives asynchronously on `on-init`. */
    consentRequestId: varchar('consent_request_id', { length: 64 }),

    hiTypes: text('hi_types').array().notNull().default(sql`ARRAY[]::text[]`),
    /** CAREMGT for a doctor-initiated clinical pull. See ADR-092 for why only that one, for now. */
    purposeCode: varchar('purpose_code', { length: 32 }).notNull().default('CAREMGT'),
    dateRangeFrom: timestamp('date_range_from', { withTimezone: true }),
    dateRangeTo: timestamp('date_range_to', { withTimezone: true }),
    /** When we commit to destroying our copy. A promise to the patient, enforced by the sweep. */
    dataEraseAt: timestamp('data_erase_at', { withTimezone: true }),

    /** requested → granted | denied | expired | failed. `requested` is a normal resting state. */
    status: varchar('status', { length: 24 }).notNull().default('pending'),
    lastError: text('last_error'),
    /** Set when the gateway or a poll last told us anything, so a stalled request is visible. */
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantRequestUnique: unique('abdm_hiu_requests_tenant_request_unique').on(t.tenantId, t.consentRequestId),
    patientIdx: index('abdm_hiu_requests_patient_idx').on(t.tenantId, t.patientId),
    statusIdx: index('abdm_hiu_requests_status_idx').on(t.status),
  }),
);

/**
 * A granted consent artefact — one per HIP holding records, not one per request.
 *
 * Deliberately NOT merged with `abdm_consents` (M2). That table records permission somebody gave to
 * take data *from* us; this one records permission *we* were given to hold data belonging to another
 * hospital. Same word, opposite obligations: one governs what we may disclose, the other what we
 * must destroy. One table would make every query ambiguous about which it meant.
 */
export const abdmHiuConsents = pgTable(
  'abdm_hiu_consents',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    requestId: uuid('request_id')
      .notNull()
      .references(() => abdmHiuConsentRequests.id, { onDelete: 'cascade' }),

    /** ABDM's artefact id — the handle the data request quotes. */
    consentId: varchar('consent_id', { length: 64 }).notNull(),
    /** Which hospital's records this artefact unlocks. */
    hipId: varchar('hip_id', { length: 64 }),
    hiuId: varchar('hiu_id', { length: 64 }),
    consentManagerId: varchar('consent_manager_id', { length: 32 }),
    abhaAddress: varchar('abha_address', { length: 80 }).notNull(),

    purposeCode: varchar('purpose_code', { length: 32 }),
    purposeText: varchar('purpose_text', { length: 200 }),
    hiTypes: text('hi_types').array().notNull().default(sql`ARRAY[]::text[]`),
    /** `{ patientReference, careContextReference }` pairs, exactly as the artefact named them. */
    careContexts: jsonb('care_contexts'),
    accessMode: varchar('access_mode', { length: 16 }),

    /** The clinical window the patient agreed to. Narrower than this is fine; wider is a breach. */
    dateRangeFrom: timestamp('date_range_from', { withTimezone: true }),
    dateRangeTo: timestamp('date_range_to', { withTimezone: true }),
    /** When our copy must be gone. The sweep treats this as a deadline, not a suggestion. */
    dataEraseAt: timestamp('data_erase_at', { withTimezone: true }),
    frequencyUnit: varchar('frequency_unit', { length: 16 }),
    frequencyValue: integer('frequency_value'),
    frequencyRepeats: integer('frequency_repeats'),

    /** granted | revoked | expired. A row that is not `granted` may never yield a record. */
    status: varchar('status', { length: 16 }).notNull().default('granted'),
    signature: text('signature'),
    grantedAt: timestamp('granted_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantConsentUnique: unique('abdm_hiu_consents_tenant_consent_unique').on(t.tenantId, t.consentId),
    requestIdx: index('abdm_hiu_consents_request_idx').on(t.requestId),
    eraseIdx: index('abdm_hiu_consents_erase_idx').on(t.dataEraseAt),
  }),
);

/**
 * Another hospital's clinical records, held on loan.
 *
 * **Built to be deleted.** `consent_id` cascades, so purging a consent purges its records in the
 * same statement — a purge cannot succeed halfway and leave orphaned clinical data behind. There is
 * deliberately no `deleted_at`: the certification test checks the data is *gone*, and a hidden row
 * is not gone.
 *
 * `content` holds the decrypted FHIR bundle as JSONB rather than a file in object storage, because
 * deletion here has to be **atomic and provable**. A blob delete is eventually consistent and lives
 * outside the transaction that removes the consent; one `DELETE ... WHERE consent_id = $1` is
 * neither.
 */
export const abdmHiuRecords = pgTable(
  'abdm_hiu_records',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    consentId: uuid('consent_id')
      .notNull()
      .references(() => abdmHiuConsents.id, { onDelete: 'cascade' }),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),

    /** Which hospital this came from, so the timeline can attribute it honestly. */
    sourceHipId: varchar('source_hip_id', { length: 64 }),
    careContextReference: varchar('care_context_reference', { length: 128 }),
    hiType: varchar('hi_type', { length: 40 }).notNull(),

    /** The decrypted FHIR bundle. Somebody else's clinical data — see the table comment. */
    content: jsonb('content').notNull(),
    /** The bundle's own clinical date, which is what the timeline sorts on. */
    recordDate: timestamp('record_date', { withTimezone: true }),
    /** The HIP's checksum, kept so a later integrity question can be answered without re-fetching. */
    checksum: varchar('checksum', { length: 64 }),

    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    consentIdx: index('abdm_hiu_records_consent_idx').on(t.consentId),
    // The timeline's own query: one patient, newest first, across every source.
    timelineIdx: index('abdm_hiu_records_timeline_idx').on(t.tenantId, t.patientId, t.recordDate),
  }),
);

/**
 * One request for records from one hospital, and the keys that will decrypt the answer (ADR-093).
 *
 * The awkward part of M3, and the reason this table exists at all: we generate a key pair, send the
 * **public** half in the request, and the HIP pushes the encrypted records back minutes later on a
 * separate connection. The **private** half has to survive that gap, so it is stored — encrypted at
 * rest with `encryptSecret`, exactly like an ABDM token (ADR-084), because a readable private key
 * is standing ability to decrypt somebody's medical history.
 *
 * A fresh pair per request (`generateKeyPair`), never a long-lived one: a single compromise should
 * expose one document set, not every transfer ever made.
 */
export const abdmHiuDataTransfers = pgTable(
  'abdm_hiu_data_transfers',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    /** Cascades: purging the consent destroys the keys that could read anything sent under it. */
    consentId: uuid('consent_id')
      .notNull()
      .references(() => abdmHiuConsents.id, { onDelete: 'cascade' }),

    /** ABDM's id for this exchange, and how an inbound push finds its way back here. */
    transactionId: varchar('transaction_id', { length: 128 }),
    requestId: varchar('request_id', { length: 128 }),

    /** Our half of the ECDH exchange. Private key ENCRYPTED at rest — see the table comment. */
    privateKeyEnc: text('private_key_enc'),
    publicKey: text('public_key'),
    nonce: varchar('nonce', { length: 128 }),

    /** requested → receiving → delivered | failed. */
    status: varchar('status', { length: 24 }).notNull().default('requested'),
    reason: text('reason'),
    pagesReceived: integer('pages_received').notNull().default(0),
    pageCount: integer('page_count'),
    entriesStored: integer('entries_stored').notNull().default(0),

    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantTransactionUnique: unique('abdm_hiu_transfers_tenant_txn_unique').on(t.tenantId, t.transactionId),
    consentIdx: index('abdm_hiu_transfers_consent_idx').on(t.consentId),
  }),
);

export type AbdmHiuConsentRequest = typeof abdmHiuConsentRequests.$inferSelect;
export type AbdmHiuConsent = typeof abdmHiuConsents.$inferSelect;
export type AbdmHiuRecord = typeof abdmHiuRecords.$inferSelect;
export type AbdmHiuDataTransfer = typeof abdmHiuDataTransfers.$inferSelect;
