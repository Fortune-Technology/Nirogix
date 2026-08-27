CREATE TABLE "abdm_facility_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid,
	"tracking_id" varchar(64),
	"facility_id" varchar(64),
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"status_message" text,
	"facility_name" varchar(200) NOT NULL,
	"ownership_code" varchar(32),
	"facility_type_code" varchar(32),
	"system_of_medicine_code" varchar(32),
	"state_lgd_code" varchar(16),
	"district_lgd_code" varchar(16),
	"pincode" varchar(10),
	"payload" jsonb,
	"submitted_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abdm_facility_registry_tenant_branch_unique" UNIQUE("tenant_id","branch_id")
);
--> statement-breakpoint
ALTER TABLE "abdm_facility_registry" ADD CONSTRAINT "abdm_facility_registry_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abdm_facility_registry" ADD CONSTRAINT "abdm_facility_registry_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abdm_facility_registry_tracking_idx" ON "abdm_facility_registry" USING btree ("tracking_id");--> statement-breakpoint
CREATE INDEX "abdm_facility_registry_status_idx" ON "abdm_facility_registry" USING btree ("tenant_id","status");