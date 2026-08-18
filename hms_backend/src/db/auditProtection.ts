import type { Pool } from 'pg';

// Makes audit_log append-only at the DATABASE level: a trigger blocks UPDATE and DELETE, so the
// trail is tamper-evident even against the application role (rules.md → Audit Rules: entries are
// immutable and never deleted). Cryptographic hash-chaining is a later hardening step. Idempotent.
export const AUDIT_PROTECTION_SQL = `
CREATE OR REPLACE FUNCTION hms_audit_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (% is not permitted)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_change ON audit_log;
CREATE TRIGGER audit_log_no_change
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION hms_audit_immutable();
`;

export async function applyAuditProtection(pool: Pool): Promise<void> {
  await pool.query(AUDIT_PROTECTION_SQL);
}
