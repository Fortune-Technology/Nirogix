CREATE TABLE "practitioner_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"specialty_code" varchar(50) NOT NULL,
	"branch_id" uuid,
	"role" varchar(50) DEFAULT 'consultant' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practitioner_roles_unique" UNIQUE("provider_id","specialty_code","branch_id")
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"full_name" varchar(200) NOT NULL,
	"gender" varchar(20),
	"registration_number" varchar(100),
	"qualification" varchar(200),
	"email" varchar(255),
	"phone" varchar(32),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specialties" (
	"code" varchar(50) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"snomed_code" varchar(20)
);
--> statement-breakpoint
CREATE TABLE "specialty_form_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"specialty_code" varchar(50),
	"key" varchar(100) NOT NULL,
	"name" varchar(200) NOT NULL,
	"schema" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "specialty_form_templates_unique" UNIQUE("tenant_id","key")
);
--> statement-breakpoint
ALTER TABLE "practitioner_roles" ADD CONSTRAINT "practitioner_roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_roles" ADD CONSTRAINT "practitioner_roles_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_roles" ADD CONSTRAINT "practitioner_roles_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialty_form_templates" ADD CONSTRAINT "specialty_form_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;