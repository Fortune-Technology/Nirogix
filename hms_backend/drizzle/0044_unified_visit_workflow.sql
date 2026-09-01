-- One workflow books an appointment and checks a patient in (ADR-115).
--
-- Two columns were missing before the two forms could become one form: an appointment had no
-- department, and nothing anywhere recorded how the patient arrived. A field that exists on only
-- one of two records is exactly why they could not ask the same questions.

-- The department the appointment is booked into. Nullable, like a visit's — a small clinic books a
-- doctor, not a department. RESTRICT to match `visits.department_id`: a department with history
-- behind it is deactivated, never deleted.
ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "department_id" uuid REFERENCES "departments"("id") ON DELETE restrict;

CREATE INDEX IF NOT EXISTS "appointments_department_idx"
  ON "appointments" ("tenant_id", "department_id");

-- The same chief complaint, in the same field of the same form. A limit that depended on which
-- button was pressed was a trap: the desk types a paragraph, then loses it by choosing "future".
ALTER TABLE "appointments" ALTER COLUMN "reason" TYPE varchar(2000);

-- How the patient arrived.
--
-- Deliberately NOT folded into `visits.visit_type`, which answers a different question — where the
-- patient is treated (`opd` today, inpatient later). An OPD follow-up is both, and a single column
-- can only hold one, so conflating them would make both unusable.
--
-- Existing rows: every appointment on the books was booked as an appointment, and every visit
-- recorded before this column existed was a walk-in check-in — the desk had no other option. The
-- defaults are therefore the truth about the history, not a placeholder.
ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "arrival_type" varchar(20) NOT NULL DEFAULT 'appointment';

ALTER TABLE "visits"
  ADD COLUMN IF NOT EXISTS "arrival_type" varchar(20) NOT NULL DEFAULT 'walk_in';

-- A visit that was created from an appointment is not a walk-in, and the link to say so is already
-- there. Correct the history rather than leaving it quietly wrong.
UPDATE "visits" v
   SET "arrival_type" = COALESCE(a."arrival_type", 'appointment')
  FROM "appointments" a
 WHERE a."id" = v."appointment_id"
   AND v."appointment_id" IS NOT NULL;

-- The queue board and the follow-up reports both filter on this.
CREATE INDEX IF NOT EXISTS "visits_arrival_type_idx"
  ON "visits" ("tenant_id", "visit_date", "arrival_type");
