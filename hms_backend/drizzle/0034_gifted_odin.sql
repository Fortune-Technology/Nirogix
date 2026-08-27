CREATE TABLE "abdm_link_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"transaction_id" varchar(64) NOT NULL,
	"reference_number" varchar(64) NOT NULL,
	"patient_id" uuid NOT NULL,
	"abha_address" varchar(80),
	"care_context_refs" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"channel" varchar(10) DEFAULT 'sms' NOT NULL,
	"destination" varchar(255) NOT NULL,
	"code_hash" varchar(128),
	"expires_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abdm_link_requests_tenant_ref_unique" UNIQUE("tenant_id","reference_number")
);
--> statement-breakpoint
ALTER TABLE "abdm_link_requests" ADD CONSTRAINT "abdm_link_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abdm_link_requests" ADD CONSTRAINT "abdm_link_requests_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abdm_link_requests_txn_idx" ON "abdm_link_requests" USING btree ("tenant_id","transaction_id");