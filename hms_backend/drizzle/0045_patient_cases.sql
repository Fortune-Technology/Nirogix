-- Treatment cases — the episode a run of visits belongs to (ADR-116).
--
-- The largest clinical unit the product had was the visit, so a patient treated for a fracture over
-- six weeks was six unrelated rows. `arrival_type: follow_up` (ADR-115) could record *that* a visit
-- was a return but not *what it returns to*. This is what it returns to.

CREATE TABLE IF NOT EXISTS "patient_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE restrict,
  "branch_id" uuid REFERENCES "branches"("id") ON DELETE restrict,
  "patient_id" uuid NOT NULL REFERENCES "patients"("id") ON DELETE restrict,
  -- Tenant-monotonic, `C-000001`. What staff say out loud, as `V-` numbers already are.
  "case_number" varchar(32) NOT NULL,
  -- What the case is about, in words the desk and the patient would both recognise. Deliberately
  -- NOT a diagnosis: a case is opened at the front desk before anyone has examined the patient.
  "title" varchar(200) NOT NULL,
  "department_id" uuid REFERENCES "departments"("id") ON DELETE restrict,
  "provider_id" uuid REFERENCES "providers"("id") ON DELETE restrict,
  -- open | closed. Never deleted (invariant #6) — a case opened by mistake is closed saying so.
  "status" varchar(16) DEFAULT 'open' NOT NULL,
  "notes" text,
  "opened_by" uuid,
  "opened_at" timestamp with time zone DEFAULT now() NOT NULL,
  "closed_by" uuid,
  "closed_at" timestamp with time zone,
  "close_reason" varchar(300),
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "patient_cases_tenant_number_unique" UNIQUE("tenant_id","case_number")
);

-- The question asked on every single check-in: what is already open for this patient?
CREATE INDEX IF NOT EXISTS "patient_cases_patient_idx"
  ON "patient_cases" ("tenant_id", "patient_id", "status");

-- The visit's link to its episode. Nullable, and it stays nullable: a one-off consultation is not
-- an episode, and forcing every walk-in to open a case would fill the chart with one-visit cases
-- nobody ever closes. RESTRICT, because a case with visits under it is history, not a draft.
ALTER TABLE "visits"
  ADD COLUMN IF NOT EXISTS "case_id" uuid REFERENCES "patient_cases"("id") ON DELETE restrict;

CREATE INDEX IF NOT EXISTS "visits_case_idx" ON "visits" ("tenant_id", "case_id");

-- No backfill, deliberately. Every visit that already exists was recorded with no episode, and
-- inventing one per patient — or one per visit — would be guessing at clinical history. A case is
-- opened by someone who knows what it is for.
