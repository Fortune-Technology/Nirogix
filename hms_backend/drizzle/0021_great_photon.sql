CREATE TABLE "registration_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100),
	"gender" varchar(20),
	"date_of_birth" varchar(10),
	"phone" varchar(32) NOT NULL,
	"email" varchar(255),
	"city" varchar(100),
	"note" varchar(500),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"patient_id" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" varchar(300),
	"submitted_ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_profile" ADD COLUMN "display_name" varchar(200);--> statement-breakpoint
ALTER TABLE "organization_profile" ADD COLUMN "secondary_phone" varchar(32);--> statement-breakpoint
ALTER TABLE "organization_profile" ADD COLUMN "support_email" varchar(255);--> statement-breakpoint
ALTER TABLE "organization_profile" ADD COLUMN "letterhead_header" varchar(300);--> statement-breakpoint
ALTER TABLE "organization_profile" ADD COLUMN "letterhead_footer" varchar(500);--> statement-breakpoint
ALTER TABLE "organization_profile" ADD COLUMN "signatory_name" varchar(200);--> statement-breakpoint
ALTER TABLE "organization_profile" ADD COLUMN "signatory_designation" varchar(200);--> statement-breakpoint
ALTER TABLE "organization_profile" ADD COLUMN "self_registration_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_profile" ADD COLUMN "self_registration_token" varchar(64);--> statement-breakpoint
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "registration_requests_tenant_status_idx" ON "registration_requests" USING btree ("tenant_id","status");--> statement-breakpoint
ALTER TABLE "organization_profile" ADD CONSTRAINT "organization_profile_reg_token_unique" UNIQUE("self_registration_token");