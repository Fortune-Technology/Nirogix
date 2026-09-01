-- Per-hospital workflow configuration, and vitals as their own observation (ADR-113).
--
-- Three things happen here, in this order, and the order matters: the new tables are created, the
-- readings already sitting on `encounters` are copied into `patient_vitals`, and only then are the
-- old columns dropped. A drop before the copy would lose every vital ever recorded.
--
-- RLS is applied automatically to both tables on the next `db:migrate` — `applyRls()` finds every
-- table carrying a `tenant_id`, so a new tenant-scoped table cannot ship without a policy.

CREATE TABLE IF NOT EXISTS "hospital_workflow_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE restrict,
  -- NULL is the organization's default, inherited by every hospital with no row of its own.
  "branch_id" uuid REFERENCES "branches"("id") ON DELETE restrict,
  "vitals_mode" varchar(24) DEFAULT 'consultation_only' NOT NULL,
  "vitals_required_params" text[] DEFAULT '{}'::text[] NOT NULL,
  "vitals_optional_params" text[] DEFAULT '{}'::text[] NOT NULL,
  "payment_timing" varchar(24) DEFAULT 'before_consultation' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "hospital_workflow_config_scope_unique" UNIQUE("tenant_id","branch_id")
);

CREATE INDEX IF NOT EXISTS "hospital_workflow_config_tenant_idx"
  ON "hospital_workflow_config" ("tenant_id");

-- Postgres treats NULLs as distinct in a UNIQUE constraint, so the constraint above does not stop
-- a tenant having two organization-level rows. This does.
CREATE UNIQUE INDEX IF NOT EXISTS "hospital_workflow_config_org_scope_unique"
  ON "hospital_workflow_config" ("tenant_id")
  WHERE "branch_id" IS NULL;

CREATE TABLE IF NOT EXISTS "patient_vitals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE restrict,
  "branch_id" uuid REFERENCES "branches"("id") ON DELETE restrict,
  "visit_id" uuid NOT NULL REFERENCES "visits"("id") ON DELETE restrict,
  "patient_id" uuid NOT NULL REFERENCES "patients"("id") ON DELETE restrict,
  "stage" varchar(20) NOT NULL,
  "systolic" integer,
  "diastolic" integer,
  "pulse" integer,
  "spo2" integer,
  "resp_rate" integer,
  "temp_c_tenths" integer,
  "weight_g" integer,
  "height_cm" integer,
  "blood_sugar_mg_dl" integer,
  "blood_sugar_type" varchar(16),
  "notes" varchar(500),
  "recorded_by" uuid,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "patient_vitals_visit_idx" ON "patient_vitals" ("tenant_id","visit_id");
CREATE INDEX IF NOT EXISTS "patient_vitals_patient_idx" ON "patient_vitals" ("tenant_id","patient_id");

-- Copy every reading that exists today. `stage = 'consultation'` because that is genuinely where
-- all of them were taken — the encounter was the only place they could be recorded. `recorded_at`
-- takes the signature time where the encounter was signed, and its creation time otherwise, which
-- is the closest honest answer available: the old shape never stored when the reading was taken.
INSERT INTO "patient_vitals" (
  "tenant_id", "branch_id", "visit_id", "patient_id", "stage",
  "systolic", "diastolic", "pulse", "spo2", "resp_rate",
  "temp_c_tenths", "weight_g", "height_cm",
  "recorded_by", "recorded_at", "created_at", "updated_at"
)
SELECT
  e."tenant_id",
  v."branch_id",
  e."visit_id",
  e."patient_id",
  'consultation',
  e."vital_systolic", e."vital_diastolic", e."vital_pulse", e."vital_spo2", e."vital_resp_rate",
  e."vital_temp_c_tenths", e."vital_weight_g", e."vital_height_cm",
  e."authored_by",
  COALESCE(e."signed_at", e."created_at"),
  e."created_at",
  e."updated_at"
FROM "encounters" e
JOIN "visits" v ON v."id" = e."visit_id"
WHERE
  e."vital_systolic" IS NOT NULL
  OR e."vital_diastolic" IS NOT NULL
  OR e."vital_pulse" IS NOT NULL
  OR e."vital_spo2" IS NOT NULL
  OR e."vital_resp_rate" IS NOT NULL
  OR e."vital_temp_c_tenths" IS NOT NULL
  OR e."vital_weight_g" IS NOT NULL
  OR e."vital_height_cm" IS NOT NULL;

-- Only now, with the readings safely copied.
ALTER TABLE "encounters" DROP COLUMN IF EXISTS "vital_systolic";
ALTER TABLE "encounters" DROP COLUMN IF EXISTS "vital_diastolic";
ALTER TABLE "encounters" DROP COLUMN IF EXISTS "vital_pulse";
ALTER TABLE "encounters" DROP COLUMN IF EXISTS "vital_spo2";
ALTER TABLE "encounters" DROP COLUMN IF EXISTS "vital_resp_rate";
ALTER TABLE "encounters" DROP COLUMN IF EXISTS "vital_temp_c_tenths";
ALTER TABLE "encounters" DROP COLUMN IF EXISTS "vital_weight_g";
ALTER TABLE "encounters" DROP COLUMN IF EXISTS "vital_height_cm";

-- A chief complaint is a paragraph. 500 characters is a limit a busy desk hits, and widening a
-- varchar is a metadata-only change in Postgres — no table rewrite, no lock worth planning around.
ALTER TABLE "visits" ALTER COLUMN "reason" TYPE varchar(2000);
