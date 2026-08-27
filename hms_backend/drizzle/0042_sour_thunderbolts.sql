ALTER TABLE "abdm_transactions" ADD COLUMN "otp_sends" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "abdm_transactions" ADD COLUMN "last_otp_at" timestamp with time zone;