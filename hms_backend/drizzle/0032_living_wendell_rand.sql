CREATE TABLE "abdm_care_contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid,
	"patient_id" uuid NOT NULL,
	"visit_id" uuid,
	"reference_number" varchar(64) NOT NULL,
	"display_label" varchar(200) NOT NULL,
	"hi_types" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"abha_address" varchar(80),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"linked_at" timestamp with time zone,
	"last_error" varchar(300),
	"link_attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abdm_care_contexts_tenant_ref_unique" UNIQUE("tenant_id","reference_number")
);
--> statement-breakpoint
CREATE TABLE "abdm_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"consent_id" varchar(64) NOT NULL,
	"abha_address" varchar(80) NOT NULL,
	"hip_id" varchar(64) NOT NULL,
	"hiu_id" varchar(64),
	"consent_manager_id" varchar(32),
	"purpose_code" varchar(32),
	"purpose_text" varchar(200),
	"hi_types" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"access_mode" varchar(16),
	"date_range_from" timestamp with time zone,
	"date_range_to" timestamp with time zone,
	"data_erase_at" timestamp with time zone,
	"frequency_unit" varchar(16),
	"frequency_value" integer,
	"frequency_repeats" integer,
	"care_contexts" jsonb,
	"signature" text,
	"granted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abdm_consents_tenant_consent_unique" UNIQUE("tenant_id","consent_id")
);
--> statement-breakpoint
ALTER TABLE "abdm_care_contexts" ADD CONSTRAINT "abdm_care_contexts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abdm_care_contexts" ADD CONSTRAINT "abdm_care_contexts_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abdm_care_contexts" ADD CONSTRAINT "abdm_care_contexts_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abdm_consents" ADD CONSTRAINT "abdm_consents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abdm_care_contexts_patient_idx" ON "abdm_care_contexts" USING btree ("tenant_id","patient_id");--> statement-breakpoint
CREATE INDEX "abdm_care_contexts_status_idx" ON "abdm_care_contexts" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "abdm_care_contexts_visit_idx" ON "abdm_care_contexts" USING btree ("tenant_id","visit_id");--> statement-breakpoint
CREATE INDEX "abdm_consents_abha_idx" ON "abdm_consents" USING btree ("tenant_id","abha_address");--> statement-breakpoint
CREATE INDEX "abdm_consents_erase_idx" ON "abdm_consents" USING btree ("data_erase_at");