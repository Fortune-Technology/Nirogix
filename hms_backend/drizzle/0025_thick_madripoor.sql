CREATE TABLE "reference_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" varchar(40) NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reference_catalog_category_code_unique" UNIQUE("category","code")
);
--> statement-breakpoint
CREATE TABLE "tenant_reference_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category" varchar(40) NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_reference_items_unique" UNIQUE("tenant_id","category","code")
);
--> statement-breakpoint
ALTER TABLE "drugs" ADD COLUMN "catalog_code" varchar(64);--> statement-breakpoint
ALTER TABLE "lab_tests" ADD COLUMN "catalog_code" varchar(64);--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "catalog_code" varchar(64);--> statement-breakpoint
ALTER TABLE "tenant_reference_items" ADD CONSTRAINT "tenant_reference_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;