-- Electronic signatures, kept as versions (ADR-137).
--
-- IMPORTANT, and written here because it is the claim that must never drift: this is an
-- ELECTRONIC signature — an image a person uploaded, rendered onto a generated document. It is
-- NOT a cryptographic digital signature. Nothing signs a hash, nothing is tamper-evident, and no
-- certificate authority is involved. A hospital may not be told otherwise.
--
-- Versions, not edits. Uploading again inserts a new row and marks the previous one `superseded`;
-- a row's `file_id` is never repointed. That is the whole mechanism behind the rule that matters:
-- a document records WHICH version signed it, so a clinician who changes their signature next
-- year cannot change what a prescription printed last year shows.
--
-- Tenant-scoped, so `applyRls` picks it up on the next migrate.

CREATE TABLE IF NOT EXISTS "user_signatures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "file_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "retired_at" timestamp with time zone
);

DO $$ BEGIN
  ALTER TABLE "user_signatures"
    ADD CONSTRAINT "user_signatures_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ON DELETE RESTRICT: the image behind a signature that has signed a document can never be
-- removed out from under it.
DO $$ BEGIN
  ALTER TABLE "user_signatures"
    ADD CONSTRAINT "user_signatures_file_id_file_metadata_id_fk"
    FOREIGN KEY ("file_id") REFERENCES "public"."file_metadata"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- The hot read: "this user's current signature".
CREATE INDEX IF NOT EXISTS "user_signatures_user_idx"
  ON "user_signatures" ("tenant_id", "user_id", "status");

-- One version number per user, and at most one active signature each — both enforced by the
-- database rather than by the service remembering to look, because two concurrent uploads would
-- otherwise each read version N and each write N+1.
CREATE UNIQUE INDEX IF NOT EXISTS "user_signatures_version_idx"
  ON "user_signatures" ("tenant_id", "user_id", "version");

CREATE UNIQUE INDEX IF NOT EXISTS "user_signatures_one_active_idx"
  ON "user_signatures" ("tenant_id", "user_id")
  WHERE "status" = 'active';

-- Which signature version signed a document. Nullable: every record written before today was
-- signed without one, and a hospital that configures no signatures keeps working exactly as it
-- does now. No foreign key — a signature row is retained forever, and this pin must never be
-- able to block a signature or a verification being written.
ALTER TABLE "encounters" ADD COLUMN IF NOT EXISTS "signature_id" uuid;
ALTER TABLE "lab_results" ADD COLUMN IF NOT EXISTS "signature_id" uuid;
