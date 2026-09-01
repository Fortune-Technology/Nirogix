-- The consultation fee schedule (ADR-117).
--
-- Before this, the fee was one column — `providers.consultation_fee_paise` — so a hospital charging
-- differently for a follow-up, or for cardiology, or for a senior consultant, had one way to say so:
-- type the number by hand at every check-in. That is not a pricing policy. It is a policy held in a
-- receptionist's head, applied inconsistently, and invisible to anyone auditing what the hospital
-- actually charges.

CREATE TABLE IF NOT EXISTS "consultation_fee_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE restrict,
  -- NULL = every hospital in the organization. A branch rule wins over an organization one.
  "branch_id" uuid REFERENCES "branches"("id") ON DELETE restrict,
  -- All three NULL-able; NULL means "any". That is what lets one table hold both "every follow-up
  -- is ₹200" and "Dr Sharma's first visit is ₹800" without either being a special case.
  "provider_id" uuid REFERENCES "providers"("id") ON DELETE restrict,
  "department_id" uuid REFERENCES "departments"("id") ON DELETE restrict,
  "arrival_type" varchar(20),
  "fee_paise" integer NOT NULL,
  -- Retired, never deleted: a rule that priced a consultation last month is part of the explanation
  -- for an invoice raised last month.
  "is_active" boolean DEFAULT true NOT NULL,
  "label" varchar(200),
  "created_by" uuid,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "consultation_fee_rules_tenant_idx"
  ON "consultation_fee_rules" ("tenant_id", "is_active");

-- Two rules matching on exactly the same things are a contradiction, not a refinement. NULLS NOT
-- DISTINCT is what makes that hold for the "any" dimensions too — without it Postgres treats every
-- NULL as unique and the constraint would never fire on the rules most likely to be duplicated.
CREATE UNIQUE INDEX IF NOT EXISTS "consultation_fee_rules_combination_unique"
  ON "consultation_fee_rules" ("tenant_id", "branch_id", "provider_id", "department_id", "arrival_type")
  NULLS NOT DISTINCT;

-- What the schedule said, kept on the visit even when the desk charged something else. The invoice
-- holds what was billed; this holds what should have been, and the gap is what an override means.
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "calculated_fee_paise" integer;
ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "fee_override_reason" varchar(300);

-- No backfill and no seeded rules, deliberately. A tenant with an empty schedule resolves to the
-- doctor's own configured fee and then to zero, which is exactly what check-in did before this
-- existed — so shipping the table changes nothing until a hospital writes its first rule.
