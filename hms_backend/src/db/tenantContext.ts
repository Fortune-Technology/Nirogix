import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { pool } from './client';
import * as schema from './schema';

export type TenantTx = NodePgDatabase<typeof schema>;

/**
 * Runs `fn` inside a single transaction whose PostgreSQL session has `app.tenant_id`
 * set to the authenticated tenant. RLS policies on every tenant-scoped table read
 * `current_setting('app.tenant_id')`, so all queries within `fn` are automatically
 * restricted to that tenant — isolation is enforced by the database, not by hand.
 *
 * INVARIANT: `tenantId` must come only from the authenticated session, never from
 * client-supplied input. See resources/architecture.md (Multi-Tenancy) and
 * resources/rules.md (Tenancy Rules). This is the single place tenant context is set
 * (ADR-012 / development-plan.md §12).
 *
 * `set_config(key, value, true)` scopes the setting to this transaction only (is_local),
 * so a pooled connection never leaks one request's tenant context into the next.
 */
export async function runWithTenant<T>(
  tenantId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    await conn.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const tx = drizzle(conn, { schema });
    const result = await fn(tx);
    await conn.query('COMMIT');
    return result;
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
}
