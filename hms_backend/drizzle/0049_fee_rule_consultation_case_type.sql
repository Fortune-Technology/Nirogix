-- Consultation type and case type as pricing dimensions (ADR-121).
--
-- The fee schedule shipped in ADR-117 priced on doctor, department and how the patient arrived.
-- That covers a hospital whose price list is a grid of doctors, and no hospital whose price list
-- says "teleconsultation ₹300" or "corporate patients are billed to the employer at the contract
-- rate". Those are the two dimensions a real Indian OPD tariff actually turns on, and neither could
-- be written down.
--
-- Both vocabularies belong to the hospital, not to us. A teaching hospital's consultation types
-- ("First OPD", "Review", "Procedure room") and a corporate clinic's ("Employee", "Pre-employment
-- medical") have nothing in common, and a fixed enum would be wrong for both. So the lists live in
-- `hospital_workflow_config` and the columns store the hospital's own word.
--
-- Every list starts EMPTY, which is the whole compatibility story: an empty list means the field is
-- not shown, no visit carries a value, and every rule matches on NULL exactly as it did yesterday.

-- The vocabularies. Same table, same branch-then-organization resolution, as every other workflow
-- setting — a hospital in a group can price on a type its sister hospital has never heard of.
ALTER TABLE "hospital_workflow_config"
  ADD COLUMN IF NOT EXISTS "consultation_types" text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE "hospital_workflow_config"
  ADD COLUMN IF NOT EXISTS "case_types" text[] DEFAULT '{}'::text[] NOT NULL;

-- What kind of consultation this visit is. Chosen at check-in, from the hospital's own list.
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "consultation_type" varchar(40);

-- What kind of episode this is. Set when the case is opened, and it prices every visit under it —
-- which is the point: a corporate case does not stop being corporate on its third follow-up.
ALTER TABLE "patient_cases" ADD COLUMN IF NOT EXISTS "case_type" varchar(40);

-- The two new dimensions on a rule. NULL means "any", exactly like the other three.
ALTER TABLE "consultation_fee_rules" ADD COLUMN IF NOT EXISTS "consultation_type" varchar(40);
ALTER TABLE "consultation_fee_rules" ADD COLUMN IF NOT EXISTS "case_type" varchar(40);

-- The duplicate guard has to cover the new dimensions too, or "Dr Sharma, teleconsultation" and
-- "Dr Sharma, procedure" would collide as one combination. Dropped and recreated rather than
-- altered: a unique index's column list is not alterable in place.
DROP INDEX IF EXISTS "consultation_fee_rules_combination_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "consultation_fee_rules_combination_unique"
  ON "consultation_fee_rules" (
    "tenant_id", "branch_id", "provider_id", "department_id",
    "arrival_type", "consultation_type", "case_type"
  )
  NULLS NOT DISTINCT;

-- No backfill. Every existing rule keeps NULL in both new columns, which reads as "any" — so it
-- goes on matching every visit it matched before, at the same specificity relative to its peers.
