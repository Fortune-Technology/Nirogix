// Vitest globalSetup — runs ONCE before any test file.
//
// The integration tests hit a real PostgreSQL and seed their own tenants, but they need the schema
// to exist first. This guarantees it, whether the database is a freshly-created CI one or a
// developer's local dev DB: run the migrations, (re)apply the RLS policies and the audit-log
// append-only trigger. Everything here is idempotent, so it is a no-op on an already-migrated DB.
//
// Without this, CI (which starts an empty Postgres) had no schema, so most test files failed in
// their `beforeAll` with `relation "permissions" does not exist`. `setupFiles` (test-setup.ts) only
// loads `.env`; it does not touch the schema.
import { config } from 'dotenv';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

export default async function setup(): Promise<void> {
  config(); // local: load hms_backend/.env before config/env.ts reads it. CI: env from the workflow.

  // Dynamic imports so dotenv has populated process.env before config/env.ts validates it.
  const { db, pool } = await import('./db/client');
  const { applyRls } = await import('./db/rls');
  const { applyAuditProtection } = await import('./db/auditProtection');

  await migrate(db, { migrationsFolder: 'drizzle' });
  await applyRls(pool);
  await applyAuditProtection(pool);
  await pool.end();
}
