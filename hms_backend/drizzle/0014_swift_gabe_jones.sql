CREATE TABLE "dispenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"prescription_id" uuid,
	"visit_id" uuid,
	"patient_id" uuid NOT NULL,
	"drug_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_paise" bigint NOT NULL,
	"total_paise" bigint NOT NULL,
	"invoice_id" uuid,
	"dispensed_by" uuid,
	"dispensed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drug_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"drug_id" uuid NOT NULL,
	"batch_no" varchar(60),
	"expiry_date" date,
	"quantity" integer DEFAULT 0 NOT NULL,
	"cost_price_paise" bigint,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drugs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"form" varchar(40),
	"strength" varchar(60),
	"unit" varchar(30) DEFAULT 'unit' NOT NULL,
	"hsn_sac" varchar(12),
	"unit_price_paise" bigint DEFAULT 0 NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"reorder_level" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dispenses" ADD CONSTRAINT "dispenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispenses" ADD CONSTRAINT "dispenses_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispenses" ADD CONSTRAINT "dispenses_drug_id_drugs_id_fk" FOREIGN KEY ("drug_id") REFERENCES "public"."drugs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drug_batches" ADD CONSTRAINT "drug_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drug_batches" ADD CONSTRAINT "drug_batches_drug_id_drugs_id_fk" FOREIGN KEY ("drug_id") REFERENCES "public"."drugs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drugs" ADD CONSTRAINT "drugs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;