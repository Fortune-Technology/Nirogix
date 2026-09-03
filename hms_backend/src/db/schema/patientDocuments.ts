import { pgTable, uuid, varchar, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { patients } from './patients';
import { visits } from './visits';
import { patientCases } from './cases';

/**
 * A document attached to a patient (ADR-119).
 *
 * `file_metadata` is deliberately generic — it stores branding assets, letterheads and lab-report
 * scans with equal indifference, and knows nothing about who a file is *about*. That is the right
 * shape for a file store, and it is why "show me this patient's documents" could not be asked: the
 * only links to files were single columns on other tables (`tenant_branding.logo_file_id`,
 * `lab_results.file_id`). This table adds the clinical attachment concept without teaching the file
 * store about patients.
 *
 * `file_id` is a plain uuid with **no foreign key**, matching the convention the other file
 * references already use: files soft-delete and are retained for audit, so a hard FK would either
 * block that or cascade away the attachment record along with it.
 *
 * A visit and a case are both optional and both useful. A referral letter handed over at the desk
 * belongs to the visit it arrived with; an MRI report belongs to the episode being treated. A
 * document with neither is simply the patient's — an insurance card does not belong to one visit.
 */
export const patientDocuments = pgTable(
  'patient_documents',
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
    /** The visit it arrived with, where it arrived with one. */
    visitId: uuid('visit_id').references(() => visits.id, { onDelete: 'set null' }),
    /** The episode it belongs to (ADR-116), where it belongs to one. */
    caseId: uuid('case_id').references(() => patientCases.id, { onDelete: 'set null' }),

    /** See the note above: no FK on purpose. */
    fileId: uuid('file_id').notNull(),

    /**
     * What it is, from a short fixed list — `referral_letter`, `prior_report`, `insurance`,
     * `id_proof`, `consent_form`, `other`. Fixed rather than free text because the point of a
     * type is filtering, and free text does not filter.
     */
    documentType: varchar('document_type', { length: 32 }).notNull().default('other'),

    /** What a human would call it. Defaults to the filename when nobody types anything better. */
    title: varchar('title', { length: 200 }).notNull(),
    note: varchar('note', { length: 500 }),

    /**
     * `active` | `archived`. Archived, never deleted — a document attached to the wrong chart is
     * corrected by archiving it with a reason, because the fact that it was once attached is
     * itself part of the record (invariant #6).
     */
    status: varchar('status', { length: 16 }).notNull().default('active'),
    archiveReason: varchar('archive_reason', { length: 300 }),
    archivedBy: uuid('archived_by'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),

    uploadedBy: uuid('uploaded_by'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The question the check-in panel and the chart both ask.
    index('patient_documents_patient_idx').on(t.tenantId, t.patientId, t.status),
    index('patient_documents_case_idx').on(t.tenantId, t.caseId),
  ],
);

export type PatientDocumentRow = typeof patientDocuments.$inferSelect;
