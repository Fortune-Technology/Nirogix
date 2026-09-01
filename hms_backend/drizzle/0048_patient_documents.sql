-- Documents attached to a patient (ADR-119).
--
-- `file_metadata` is deliberately generic: it stores branding assets, letterheads and lab-report
-- scans with equal indifference and knows nothing about who a file is *about*. That is the right
-- shape for a file store, and it is exactly why "show me this patient's documents" could not be
-- asked — the only links to files were single columns on other tables. This adds the clinical
-- attachment concept without teaching the file store about patients.

CREATE TABLE IF NOT EXISTS "patient_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE restrict,
  "patient_id" uuid NOT NULL REFERENCES "patients"("id") ON DELETE restrict,
  -- Both optional, and both useful: a referral letter handed over at the desk belongs to the visit
  -- it arrived with; an MRI report belongs to the episode. Neither set means it is simply the
  -- patient's — an insurance card does not belong to one visit.
  "visit_id" uuid REFERENCES "visits"("id") ON DELETE set null,
  "case_id" uuid REFERENCES "patient_cases"("id") ON DELETE set null,
  -- Plain uuid, NO foreign key — the same convention `tenant_branding.logo_file_id` already uses.
  -- Files soft-delete and are retained for audit, so a hard FK would either block that or cascade
  -- the attachment record away with it.
  "file_id" uuid NOT NULL,
  "document_type" varchar(32) DEFAULT 'other' NOT NULL,
  "title" varchar(200) NOT NULL,
  "note" varchar(500),
  -- Archived, never deleted (invariant #6): a document attached to the wrong chart is corrected by
  -- archiving it with a reason, because the fact that it was once attached is part of the record.
  "status" varchar(16) DEFAULT 'active' NOT NULL,
  "archive_reason" varchar(300),
  "archived_by" uuid,
  "archived_at" timestamp with time zone,
  "uploaded_by" uuid,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- The question the check-in panel and the patient chart both ask.
CREATE INDEX IF NOT EXISTS "patient_documents_patient_idx"
  ON "patient_documents" ("tenant_id", "patient_id", "status");
CREATE INDEX IF NOT EXISTS "patient_documents_case_idx"
  ON "patient_documents" ("tenant_id", "case_id");
