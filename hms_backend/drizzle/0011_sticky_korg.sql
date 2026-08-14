CREATE TYPE "public"."platform_branding_scope" AS ENUM('marketing', 'hms');--> statement-breakpoint
CREATE TABLE "platform_branding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "platform_branding_scope" NOT NULL,
	"tokens" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"logo_file_id" uuid,
	"favicon_file_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_branding_scope_unique" UNIQUE("scope")
);
