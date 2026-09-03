-- Correcting a signed consultation (ADR-134).
--
-- A signed note is the record the hospital stands behind. Before today the only honest answer to
-- "how do I fix a signed consultation?" was "you do not" — the service refuses every edit past
-- `signed`, which protects the record and leaves a real clinical need with nowhere to go: a
-- transposed reading, a drug the doctor meant to add, a diagnosis recorded against the wrong
-- side. The alternative nobody should build is silently letting the edit through, which loses
-- what was actually signed.
--
-- So reopening is an act with a record of its own. One row here per amendment, carrying the note
-- exactly as it was signed and the clinician's stated reason; the encounter moves to `amending`,
-- is corrected through the ordinary save path, and re-signing closes this row with the fields
-- that actually differ. The original is in `snapshot` and stays there.
--
-- Append-only (invariant #6). Rows are written, completed or cancelled — never deleted, and
-- `encounter_id` is ON DELETE RESTRICT rather than CASCADE so an encounter cannot take its own
-- amendment history with it. Tenant-scoped, so `applyRls` picks it up on the next migrate.

CREATE TABLE IF NOT EXISTS "encounter_amendments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "encounter_id" uuid NOT NULL,
  "status" varchar(20) DEFAULT 'open' NOT NULL,
  "reason" varchar(1000) NOT NULL,
  "snapshot" jsonb NOT NULL,
  "changed_fields" jsonb,
  "opened_at_version" integer NOT NULL,
  "amended_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

DO $$ BEGIN
  ALTER TABLE "encounter_amendments"
    ADD CONSTRAINT "encounter_amendments_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "encounter_amendments"
    ADD CONSTRAINT "encounter_amendments_encounter_id_encounters_id_fk"
    FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- The history read: every amendment on one encounter, newest first.
CREATE INDEX IF NOT EXISTS "encounter_amendments_encounter_idx"
  ON "encounter_amendments" ("tenant_id", "encounter_id", "created_at" DESC);

-- At most one amendment open per encounter, enforced by the database rather than by the service
-- remembering to look: two clinicians reopening the same note in the same second would otherwise
-- each snapshot a different "original", and the second would overwrite the first's starting point.
CREATE UNIQUE INDEX IF NOT EXISTS "encounter_amendments_one_open_idx"
  ON "encounter_amendments" ("encounter_id")
  WHERE "status" = 'open';
