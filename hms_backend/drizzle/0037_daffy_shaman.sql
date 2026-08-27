CREATE TABLE "abdm_hiu_data_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"consent_id" uuid NOT NULL,
	"transaction_id" varchar(128),
	"request_id" varchar(128),
	"private_key_enc" text,
	"public_key" text,
	"nonce" varchar(128),
	"status" varchar(24) DEFAULT 'requested' NOT NULL,
	"reason" text,
	"pages_received" integer DEFAULT 0 NOT NULL,
	"page_count" integer,
	"entries_stored" integer DEFAULT 0 NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abdm_hiu_transfers_tenant_txn_unique" UNIQUE("tenant_id","transaction_id")
);
--> statement-breakpoint
ALTER TABLE "abdm_hiu_data_transfers" ADD CONSTRAINT "abdm_hiu_data_transfers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abdm_hiu_data_transfers" ADD CONSTRAINT "abdm_hiu_data_transfers_consent_id_abdm_hiu_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."abdm_hiu_consents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abdm_hiu_transfers_consent_idx" ON "abdm_hiu_data_transfers" USING btree ("consent_id");