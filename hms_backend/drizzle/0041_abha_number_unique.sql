-- One ABHA number, one chart (ABDM TAGGING_UNIQUEPATIENTID_UNIQUEABHANUMBER, ADR-100).
--
-- The existing index on the normalised ABHA number is NOT unique, so two active charts in one
-- tenant could each claim the same national identity. Our own discovery code already handles that
-- state ("More than one chart holds that ABHA address"), which proves it was reachable rather than
-- theoretical — and a patient in that state gets unpredictable linking and discovery.
--
-- Partial and normalised on purpose:
--   * WHERE ... IS NOT NULL AND <> ''  — most patients have no ABHA, and NULLs must stay free.
--   * WHERE status = 'active'          — a soft-deleted chart must not block re-registration.
--   * regexp_replace(...)              — '91-1234-5678-9012' and '911234567890' are one identity.
CREATE UNIQUE INDEX IF NOT EXISTS patients_tenant_abha_number_unique
  ON patients (tenant_id, regexp_replace(coalesce(abha_number, ''), '[^0-9]', '', 'g'))
  WHERE abha_number IS NOT NULL AND abha_number <> '' AND status = 'active';

-- The address form is a second identifier for the same person, and carries the same rule.
CREATE UNIQUE INDEX IF NOT EXISTS patients_tenant_abha_address_unique
  ON patients (tenant_id, lower(abha_address))
  WHERE abha_address IS NOT NULL AND abha_address <> '' AND status = 'active';
