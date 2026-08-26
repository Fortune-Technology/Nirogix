CREATE TABLE "abdm_link_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"abha_address" varchar(80) NOT NULL,
	"token_enc" text,
	"expires_at" timestamp with time zone,
	"requested_at" timestamp with time zone,
	"last_error" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abdm_link_tokens_tenant_abha_unique" UNIQUE("tenant_id","abha_address")
);
--> statement-breakpoint
ALTER TABLE "abdm_link_tokens" ADD CONSTRAINT "abdm_link_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;