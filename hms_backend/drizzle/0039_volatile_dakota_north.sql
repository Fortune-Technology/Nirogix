ALTER TABLE "abdm_facility_config" DROP CONSTRAINT "abdm_facility_config_tenant_branch_unique";--> statement-breakpoint
ALTER TABLE "abdm_facility_registry" DROP CONSTRAINT "abdm_facility_registry_tenant_branch_unique";--> statement-breakpoint
ALTER TABLE "abdm_facility_config" ADD CONSTRAINT "abdm_facility_config_tenant_branch_unique" UNIQUE NULLS NOT DISTINCT("tenant_id","branch_id");--> statement-breakpoint
ALTER TABLE "abdm_facility_registry" ADD CONSTRAINT "abdm_facility_registry_tenant_branch_unique" UNIQUE NULLS NOT DISTINCT("tenant_id","branch_id");