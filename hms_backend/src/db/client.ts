import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env';
import * as schema from './schema';

// Shared connection pool. The pool connects lazily on first query, so importing this
// module does not require a reachable database (useful for boot/health before migrations).
export const pool = new Pool({ connectionString: env.DATABASE_URL });

// Base Drizzle instance. NOTE: for tenant-scoped reads/writes, use runWithTenant()
// (../tenantContext.ts) rather than this instance directly — RLS needs the per-request
// tenant GUC set inside a transaction. This base instance is for tenant-agnostic bootstrap
// operations (migrations, platform-level catalog reads) only.
export const db = drizzle(pool, { schema });

export type Database = typeof db;
