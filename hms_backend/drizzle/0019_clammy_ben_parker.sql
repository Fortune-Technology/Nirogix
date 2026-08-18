CREATE TABLE "patient_identity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mobile" varchar(20),
	"email" varchar(255),
	"full_name" varchar(200),
	"verified_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_identity_mobile_unique" UNIQUE("mobile"),
	CONSTRAINT "patient_identity_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "patient_identity_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"identity_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_identity_link_patient_unique" UNIQUE("tenant_id","patient_id")
);
--> statement-breakpoint
CREATE TABLE "patient_verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"channel" varchar(10) NOT NULL,
	"destination" varchar(255) NOT NULL,
	"code_hash" varchar(128) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_identity_link" ADD CONSTRAINT "patient_identity_link_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_identity_link" ADD CONSTRAINT "patient_identity_link_identity_id_patient_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."patient_identity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_identity_link" ADD CONSTRAINT "patient_identity_link_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_verification" ADD CONSTRAINT "patient_verification_identity_id_patient_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."patient_identity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patient_identity_link_identity_idx" ON "patient_identity_link" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "patient_verification_identity_idx" ON "patient_verification" USING btree ("identity_id");