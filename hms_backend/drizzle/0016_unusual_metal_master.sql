ALTER TABLE "sessions" ADD COLUMN "impersonated_by" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "impersonation_reason" varchar(300);--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonated_by_users_id_fk" FOREIGN KEY ("impersonated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;