CREATE TABLE "abdm_hiu_consent_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"abha_address" varchar(80) NOT NULL,
	"requester_provider_id" uuid,
	"requester_name" varchar(200) NOT NULL,
	"requester_registration_number" varchar(100) NOT NULL,
	"consent_request_id" varchar(64),
	"hi_types" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"purpose_code" varchar(32) DEFAULT 'CAREMGT' NOT NULL,
	"date_range_from" timestamp with time zone,
	"date_range_to" timestamp with time zone,
	"data_erase_at" timestamp with time zone,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abdm_hiu_requests_tenant_request_unique" UNIQUE("tenant_id","consent_request_id")
);
--> statement-breakpoint
CREATE TABLE "abdm_hiu_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"consent_id" varchar(64) NOT NULL,
	"hip_id" varchar(64),
	"hiu_id" varchar(64),
	"consent_manager_id" varchar(32),
	"abha_address" varchar(80) NOT NULL,
	"purpose_code" varchar(32),
	"purpose_text" varchar(200),
	"hi_types" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"care_contexts" jsonb,
	"access_mode" varchar(16),
	"date_range_from" timestamp with time zone,
	"date_range_to" timestamp with time zone,
	"data_erase_at" timestamp with time zone,
	"frequency_unit" varchar(16),
	"frequency_value" integer,
	"frequency_repeats" integer,
	"status" varchar(16) DEFAULT 'granted' NOT NULL,
	"signature" text,
	"granted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abdm_hiu_consents_tenant_consent_unique" UNIQUE("tenant_id","consent_id")
);
--> statement-breakpoint
CREATE TABLE "abdm_hiu_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"consent_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"source_hip_id" varchar(64),
	"care_context_reference" varchar(128),
	"hi_type" varchar(40) NOT NULL,
	"content" jsonb NOT NULL,
	"record_date" timestamp with time zone,
	"checksum" varchar(64),
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "abdm_hiu_consent_requests" ADD CONSTRAINT "abdm_hiu_consent_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abdm_hiu_consent_requests" ADD CONSTRAINT "abdm_hiu_consent_requests_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abdm_hiu_consent_requests" ADD CONSTRAINT "abdm_hiu_consent_requests_requester_provider_id_providers_id_fk" FOREIGN KEY ("requester_provider_id") REFERENCES "public"."providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abdm_hiu_consents" ADD CONSTRAINT "abdm_hiu_consents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abdm_hiu_consents" ADD CONSTRAINT "abdm_hiu_consents_request_id_abdm_hiu_consent_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."abdm_hiu_consent_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abdm_hiu_records" ADD CONSTRAINT "abdm_hiu_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abdm_hiu_records" ADD CONSTRAINT "abdm_hiu_records_consent_id_abdm_hiu_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."abdm_hiu_consents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abdm_hiu_records" ADD CONSTRAINT "abdm_hiu_records_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abdm_hiu_requests_patient_idx" ON "abdm_hiu_consent_requests" USING btree ("tenant_id","patient_id");--> statement-breakpoint
CREATE INDEX "abdm_hiu_requests_status_idx" ON "abdm_hiu_consent_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "abdm_hiu_consents_request_idx" ON "abdm_hiu_consents" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "abdm_hiu_consents_erase_idx" ON "abdm_hiu_consents" USING btree ("data_erase_at");--> statement-breakpoint
CREATE INDEX "abdm_hiu_records_consent_idx" ON "abdm_hiu_records" USING btree ("consent_id");--> statement-breakpoint
CREATE INDEX "abdm_hiu_records_timeline_idx" ON "abdm_hiu_records" USING btree ("tenant_id","patient_id","record_date");