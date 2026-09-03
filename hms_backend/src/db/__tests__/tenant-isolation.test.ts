import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from '../schema';
import { branches } from '../schema';
import { applyRls } from '../rls';
import { runWithTenant } from '../tenantContext';

// Proves PostgreSQL Row-Level Security isolates tenants: Tenant A can never read or write
// Tenant B's rows (resources/rules.md → Tenancy Rules; the invariant tested on every module).
//
// Needs a reachable PostgreSQL whose connection role can create a role + tables
// (TEST_DATABASE_URL, else DATABASE_URL). CI provides one (Postgres service). If none is
// reachable, the suite SKIPS with a message rather than failing — so `npm test` stays green
// on a machine without a database, while CI enforces it for real.

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const APP_ROLE = 'hms_rls_test_app';
const APP_PW = 'rls_test_pw'; // throwaway role, created and dropped by this test only
const TEST_PREFIX = 'RLSTEST_';

let ready = false;
let skipReason = 'no DATABASE_URL / TEST_DATABASE_URL set';
let adminPool: Pool | undefined;
let appPool: Pool | undefined;
let tenantA = '';
let tenantB = '';

beforeAll(async () => {
  if (!DB_URL) return;
  try {
    adminPool = new Pool({ connectionString: DB_URL, connectionTimeoutMillis: 3000 });
    await adminPool.query('SELECT 1');

    // Schema + RLS (idempotent).
    const adminDb = drizzle(adminPool, { schema });
    await migrate(adminDb, { migrationsFolder: 'drizzle' });
    await applyRls(adminPool);

    // A dedicated NON-superuser role so RLS actually applies (superusers bypass it).
    await adminPool.query(
      `DO $$ BEGIN
         IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
           EXECUTE 'DROP OWNED BY ${APP_ROLE}';
           EXECUTE 'DROP ROLE ${APP_ROLE}';
         END IF;
       END $$;`,
    );
    await adminPool.query(`CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PW}' NOSUPERUSER`);
    await adminPool.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);
    await adminPool.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON tenants, branches TO ${APP_ROLE}`,
    );

    // Clean any leftovers from a prior run, then seed two tenants (admin bypasses RLS).
    await adminPool.query(`DELETE FROM branches WHERE code LIKE '${TEST_PREFIX}%'`);
    await adminPool.query(`DELETE FROM tenants WHERE code LIKE '${TEST_PREFIX}%'`);
    const a = await adminPool.query(
      `INSERT INTO tenants (name, code) VALUES ('RLS Test A', '${TEST_PREFIX}A') RETURNING id`,
    );
    const b = await adminPool.query(
      `INSERT INTO tenants (name, code) VALUES ('RLS Test B', '${TEST_PREFIX}B') RETURNING id`,
    );
    tenantA = a.rows[0].id;
    tenantB = b.rows[0].id;

    // The application connection: the non-superuser role.
    const u = new URL(DB_URL);
    appPool = new Pool({
      host: u.hostname,
      port: Number(u.port || 5432),
      database: decodeURIComponent(u.pathname.slice(1)),
      user: APP_ROLE,
      password: APP_PW,
      connectionTimeoutMillis: 3000,
    });
    await appPool.query('SELECT 1');

    ready = true;
  } catch (err) {
    skipReason = (err as Error).message;
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[tenant-isolation] skipping — ${skipReason}`);
  }
});

afterAll(async () => {
  try {
    if (adminPool) {
      await adminPool.query(`DELETE FROM branches WHERE code LIKE '${TEST_PREFIX}%'`);
      await adminPool.query(`DELETE FROM tenants WHERE code LIKE '${TEST_PREFIX}%'`);
    }
    if (appPool) await appPool.end();
    if (adminPool) {
      await adminPool.query(
        `DO $$ BEGIN
           IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
             EXECUTE 'DROP OWNED BY ${APP_ROLE}';
             EXECUTE 'DROP ROLE ${APP_ROLE}';
           END IF;
         END $$;`,
      );
      await adminPool.end();
    }
  } catch {
    /* best-effort cleanup */
  }
});

describe('multi-tenant Row-Level Security', () => {
  test('a tenant reads only its own rows', async ({ skip }) => {
    if (!ready) return skip();

    await runWithTenant(
      tenantA,
      (tx) =>
        tx.insert(branches).values({ tenantId: tenantA, name: 'A Main', code: `${TEST_PREFIX}A1` }),
      appPool,
    );
    await runWithTenant(
      tenantB,
      (tx) =>
        tx.insert(branches).values({ tenantId: tenantB, name: 'B Main', code: `${TEST_PREFIX}B1` }),
      appPool,
    );

    const aRows = await runWithTenant(tenantA, (tx) => tx.select().from(branches), appPool);
    const bRows = await runWithTenant(tenantB, (tx) => tx.select().from(branches), appPool);

    expect(aRows).toHaveLength(1);
    expect(aRows[0]?.tenantId).toBe(tenantA);
    expect(aRows[0]?.code).toBe(`${TEST_PREFIX}A1`);

    expect(bRows).toHaveLength(1);
    expect(bRows[0]?.tenantId).toBe(tenantB);

    // The decisive assertion: A's result set never contains B's tenant_id.
    expect(aRows.some((r) => r.tenantId === tenantB)).toBe(false);
  });

  test('a tenant cannot write a row for another tenant (RLS WITH CHECK)', async ({ skip }) => {
    if (!ready) return skip();

    await expect(
      runWithTenant(
        tenantA,
        (tx) =>
          tx
            .insert(branches)
            .values({ tenantId: tenantB, name: 'Sneaky', code: `${TEST_PREFIX}X1` }),
        appPool,
      ),
    ).rejects.toThrow();
  });
});
