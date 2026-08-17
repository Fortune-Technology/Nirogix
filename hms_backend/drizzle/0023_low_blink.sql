ALTER TABLE "providers" ADD COLUMN "consultation_fee_paise" bigint;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD COLUMN "test_id" uuid;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD COLUMN "drug_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_source_unique" UNIQUE("tenant_id","source_module","source_ref");