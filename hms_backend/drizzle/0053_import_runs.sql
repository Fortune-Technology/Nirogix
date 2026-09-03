-- What a bulk import did (ADR-138).
--
-- An import is the one action in the product that creates hundreds of records from a single
-- click, which makes "what happened?" a question somebody asks weeks later, usually because
-- something is wrong. The audit log records the ACT; this records the RESULT, per run, in one row
-- a person can read: created, updated, skipped, failed, and why the failures failed.
--
-- The uploaded file itself is NOT stored. It is the hospital's own data, it may carry patient
-- identifiers, and keeping a copy of every upload forever is a liability rather than a feature.
-- The filename and the counts are what somebody needs to reconcile a run against their source.
--
-- Append-only (invariant #6). Tenant-scoped, so `applyRls` picks it up on the next migrate.

CREATE TABLE IF NOT EXISTS "import_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "module" varchar(40) NOT NULL,
  "filename" varchar(255) NOT NULL,
  "duplicate_strategy" varchar(20) NOT NULL,
  "total_rows" integer DEFAULT 0 NOT NULL,
  "created" integer DEFAULT 0 NOT NULL,
  "updated" integer DEFAULT 0 NOT NULL,
  "skipped" integer DEFAULT 0 NOT NULL,
  "failed" integer DEFAULT 0 NOT NULL,
  "errors" jsonb,
  "imported_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "import_runs"
    ADD CONSTRAINT "import_runs_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- The history read: this hospital's runs, newest first.
CREATE INDEX IF NOT EXISTS "import_runs_tenant_idx" ON "import_runs" ("tenant_id", "created_at");
