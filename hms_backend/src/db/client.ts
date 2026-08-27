import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env';
import * as schema from './schema';

// Shared connection pool. The pool connects lazily on first query, so importing this
// module does not require a reachable database (useful for boot/health before migrations).
// allowExitOnIdle lets short-lived processes (tests, scripts) exit once the pool is idle without
// an explicit end(); the long-running server is kept alive by its HTTP listener regardless.
//
// The two timeouts close SECURITY-AUDIT.md M-2's remaining half. Application-level caps
// (page size, the 366-day report span) bound the queries we wrote; a timeout bounds the ones
// we did not — a pathological plan, a missing index after a data-shape change, a lock wait —
// so one request can never hold a pooled connection indefinitely and starve the rest.
// `idle_in_transaction_session_timeout` additionally kills a transaction left open across a
// round trip, the failure mode already observed during refresh-rotation work (BACKLOG.md).
// Both are sent as connection parameters, so every session in the pool gets them.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  allowExitOnIdle: true,
  statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
  idle_in_transaction_session_timeout: env.DB_IDLE_TX_TIMEOUT_MS,
});

// Base Drizzle instance. NOTE: for tenant-scoped reads/writes, use runWithTenant()
// (../tenantContext.ts) rather than this instance directly — RLS needs the per-request
// tenant GUC set inside a transaction. This base instance is for tenant-agnostic bootstrap
// operations (migrations, platform-level catalog reads) only.
export const db = drizzle(pool, { schema });

export type Database = typeof db;
