-- Patient self check-in (ADR-118) — the third and, deliberately, last public surface built to the
-- ADR-056 pattern.
--
-- The table is called `self_checkin_requests` and not `self_checkins` on purpose: a submission is
-- an ANNOUNCEMENT, and the front desk confirming it is what creates the visit. A visit carries a
-- queue token, opens an invoice and is what a consultation hangs off — ADR-056 forbids any public
-- path from writing one.

CREATE TABLE IF NOT EXISTS "self_checkin_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE restrict,
  -- Both nullable: an announcement that matched nothing is still recorded. The desk wants to see
  -- "somebody tried to check in and we could not find them" — that is a person in the lobby — and
  -- an endpoint that only wrote rows on a match would leak, through its own side effects, the same
  -- fact the uniform response exists to hide.
  "appointment_id" uuid REFERENCES "appointments"("id") ON DELETE set null,
  "patient_id" uuid REFERENCES "patients"("id") ON DELETE restrict,
  -- As typed. Never trusted, and never written back to the chart: it is evidence about the
  -- announcement, not a correction to a patient record.
  "claimed_phone" varchar(32) NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "announced_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resulting_visit_id" uuid REFERENCES "visits"("id") ON DELETE set null,
  "confirmed_by" uuid,
  "confirmed_at" timestamp with time zone,
  "dismiss_reason" varchar(300),
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- The desk's board: today's pending announcements for this hospital.
CREATE INDEX IF NOT EXISTS "self_checkin_requests_tenant_status_idx"
  ON "self_checkin_requests" ("tenant_id", "status", "announced_at");

-- Its own token and toggle, so retiring the poster at the entrance leaves the registration and
-- booking QR codes alone. Off by default — a hospital opts in.
ALTER TABLE "organization_profile"
  ADD COLUMN IF NOT EXISTS "self_checkin_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "organization_profile"
  ADD COLUMN IF NOT EXISTS "self_checkin_token" varchar(64);

-- The public endpoint resolves a tenant FROM this token, so it must be unique platform-wide.
ALTER TABLE "organization_profile"
  DROP CONSTRAINT IF EXISTS "organization_profile_checkin_token_unique";
ALTER TABLE "organization_profile"
  ADD CONSTRAINT "organization_profile_checkin_token_unique" UNIQUE ("self_checkin_token");
