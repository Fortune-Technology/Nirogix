-- What a seeder has already done (ADR-122).
--
-- Records with a stable natural key need nothing here: the seeders look the key up and create
-- only what is missing. This table exists for the seeding actions that have NO record of their
-- own — applying an organisation profile, setting a brand colour, enabling a public form,
-- generating the clinical history, backfilling a column added later. Those write to rows that
-- already exist, so repeating them on every staging deployment is precisely how a tester's
-- manual edit would get overwritten. A marker is written once and the action never repeats.
--
-- PLATFORM-managed like "tenants": no tenant_id, therefore no RLS policy. The tenant is
-- recorded by CODE rather than by foreign key, deliberately — a marker outlives what it
-- describes, and `--reset` is what clears it.

CREATE TABLE IF NOT EXISTS "seed_markers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "marker_key" varchar(200) NOT NULL,
  "environment" varchar(20) NOT NULL,
  "tenant_code" varchar(50),
  "detail" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- The key IS the identity: a second write of the same key must be a no-op, not a duplicate.
ALTER TABLE "seed_markers" DROP CONSTRAINT IF EXISTS "seed_markers_marker_key_unique";
ALTER TABLE "seed_markers" ADD CONSTRAINT "seed_markers_marker_key_unique" UNIQUE ("marker_key");
