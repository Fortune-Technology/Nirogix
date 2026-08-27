CREATE TABLE "abdm_staff_hpr" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"hpr_id" varchar(64),
	"hpr_address" varchar(120),
	"status" varchar(24) DEFAULT 'not_started' NOT NULL,
	"status_message" text,
	"txn_id" varchar(128),
	"txn_started_at" timestamp with time zone,
	"professional_category" varchar(24),
	"registration_council" varchar(120),
	"registration_number" varchar(64),
	"system_of_medicine" varchar(64),
	"last_synced_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abdm_staff_hpr_provider_unique" UNIQUE("tenant_id","provider_id")
);
--> statement-breakpoint
ALTER TABLE "abdm_staff_hpr" ADD CONSTRAINT "abdm_staff_hpr_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abdm_staff_hpr" ADD CONSTRAINT "abdm_staff_hpr_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abdm_staff_hpr_hpr_idx" ON "abdm_staff_hpr" USING btree ("hpr_id");--> statement-breakpoint
CREATE INDEX "abdm_staff_hpr_status_idx" ON "abdm_staff_hpr" USING btree ("tenant_id","status");