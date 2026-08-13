import type { Pool } from 'pg';

// Row-Level Security policy template (resources/rules.md → Tenancy Rules).
//
// - ENABLE turns RLS on; FORCE makes it apply even to the table owner, so a single
//   application DB role is fully constrained without relying on it lacking BYPASSRLS.
// - The policy reads `app.tenant_id`, set per request by runWithTenant(). `current_setting(x,
//   true)` returns NULL when unset and `nullif(...,'')::uuid` yields NULL, so an unset tenant
//   context matches NO rows (fail-closed) rather than erroring.
//
// CRITICAL: PostgreSQL superusers bypass RLS regardless of FORCE. The application MUST connect
// as a NON-superuser role in every environment, or isolation is silently not enforced.

function policyFor(table: string): string {
  return `
ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "${table}";
CREATE POLICY tenant_isolation ON "${table}"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
`;
}

// Returns every base table in `public` that has a `tenant_id` column — i.e. every
// tenant-scoped table. RLS is applied to all of them automatically, so "no new table ships
// without an RLS policy" is enforced mechanically, not by memory.
export async function findTenantScopedTables(pool: Pool): Promise<string[]> {
  const { rows } = await pool.query<{ table_name: string }>(
    `SELECT c.table_name
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.column_name = 'tenant_id'
        AND c.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name`,
  );
  return rows.map((r) => r.table_name);
}

// (Re)applies the RLS policy to every tenant-scoped table. Idempotent — safe on every deploy.
export async function applyRls(pool: Pool): Promise<string[]> {
  const tables = await findTenantScopedTables(pool);
  for (const table of tables) {
    await pool.query(policyFor(table));
  }
  return tables;
}
