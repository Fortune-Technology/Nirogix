CREATE TABLE "tenant_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"module" varchar(50) NOT NULL,
	"branch_id" uuid,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_until" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"reason" varchar(300),
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;