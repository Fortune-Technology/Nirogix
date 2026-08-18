CREATE TABLE "branch_item_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"item_type" varchar(40) NOT NULL,
	"item_ref" varchar(64) NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"price_override_paise" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_item_availability_unique" UNIQUE("tenant_id","branch_id","item_type","item_ref")
);
--> statement-breakpoint
ALTER TABLE "branch_item_availability" ADD CONSTRAINT "branch_item_availability_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_item_availability" ADD CONSTRAINT "branch_item_availability_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;