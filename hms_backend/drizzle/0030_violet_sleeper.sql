CREATE TABLE "abdm_facility_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid,
	"hip_id" varchar(64) NOT NULL,
	"facility_name" varchar(200),
	"qr_content" text,
	"scan_share_enabled" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abdm_facility_config_tenant_branch_unique" UNIQUE("tenant_id","branch_id")
);
--> statement-breakpoint
CREATE TABLE "abdm_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid,
	"txn_id" varchar(64),
	"flow" varchar(32) NOT NULL,
	"state" varchar(16) DEFAULT 'otp_sent' NOT NULL,
	"identifier_hint" varchar(32),
	"abha_number" varchar(20),
	"abha_address" varchar(80),
	"profile" jsonb,
	"linking_token_enc" text,
	"x_token_enc" text,
	"consent_at" timestamp with time zone,
	"consent_version" varchar(16),
	"patient_id" uuid,
	"match_outcome" varchar(16),
	"failure_code" varchar(64),
	"initiated_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "abha_address" varchar(80);--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "abha_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "abha_source" varchar(24);--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "abha_linking_token_enc" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "abha_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "abdm_facility_config" ADD CONSTRAINT "abdm_facility_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abdm_transactions" ADD CONSTRAINT "abdm_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abdm_transactions" ADD CONSTRAINT "abdm_transactions_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abdm_transactions_txn_idx" ON "abdm_transactions" USING btree ("tenant_id","txn_id");--> statement-breakpoint
CREATE INDEX "abdm_transactions_state_idx" ON "abdm_transactions" USING btree ("tenant_id","state");--> statement-breakpoint
CREATE INDEX "abdm_transactions_abha_idx" ON "abdm_transactions" USING btree ("tenant_id","abha_number");--> statement-breakpoint
-- Defence in depth for "a raw Aadhaar number is never persisted" (ADR-084). The application
-- writes only a masked hint, and this constraint makes a future code change that forgets fail at
-- the database rather than silently storing a national identifier. The pattern matches 12
-- consecutive digits, with or without 4-4-4 grouping — the same shape the log scrubber catches.
ALTER TABLE "abdm_transactions"
  ADD CONSTRAINT "abdm_transactions_identifier_hint_not_aadhaar"
  CHECK ("identifier_hint" IS NULL OR "identifier_hint" !~ '(^|[^0-9])[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}([^0-9]|$)');
--> statement-breakpoint
-- The returning-patient lookup compares ABHA numbers by digits only, because the same number is
-- written both `12-3456-7890-1234` and bare. Without this expression index that comparison is a
-- sequential scan of the tenant's whole patient table on every verification.
--
-- Deliberately NOT unique. `abha_number` predates this integration as a free-text field, so
-- existing rows may legitimately hold duplicates or malformed values, and a unique index would
-- fail the migration on live data instead of surfacing the problem where it can be fixed.
-- Uniqueness is enforced in the application (`linkToPatient` refuses to attach an ABHA that is
-- already on another chart) and promoted to a database constraint after the data audit tracked
-- in BACKLOG.md.
CREATE INDEX IF NOT EXISTS "patients_abha_digits_idx"
  ON "patients" ("tenant_id", (regexp_replace(coalesce("abha_number", ''), '[^0-9]', '', 'g')));
