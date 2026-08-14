CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid,
	"uhid" varchar(32) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100),
	"gender" varchar(20),
	"date_of_birth" date,
	"phone" varchar(20),
	"email" varchar(255),
	"blood_group" varchar(8),
	"address_line" varchar(300),
	"city" varchar(100),
	"state" varchar(100),
	"pincode" varchar(10),
	"abha_number" varchar(20),
	"emergency_contact_name" varchar(150),
	"emergency_contact_phone" varchar(20),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patients_tenant_uhid_unique" UNIQUE("tenant_id","uhid")
);
--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;