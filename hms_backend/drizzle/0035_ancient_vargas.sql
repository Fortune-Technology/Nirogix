CREATE TABLE "abdm_data_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"transaction_id" varchar(64) NOT NULL,
	"request_id" varchar(64),
	"consent_id" varchar(64) NOT NULL,
	"data_push_url" varchar(500) NOT NULL,
	"hiu_public_key" text,
	"hiu_nonce" varchar(200),
	"care_context_refs" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"date_range_from" timestamp with time zone,
	"date_range_to" timestamp with time zone,
	"status" varchar(16) DEFAULT 'received' NOT NULL,
	"reason" varchar(300),
	"entries_sent" integer DEFAULT 0 NOT NULL,
	"deadline_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abdm_data_transfers_tenant_txn_unique" UNIQUE("tenant_id","transaction_id")
);
--> statement-breakpoint
ALTER TABLE "abdm_data_transfers" ADD CONSTRAINT "abdm_data_transfers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abdm_data_transfers_status_idx" ON "abdm_data_transfers" USING btree ("tenant_id","status");