import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { sql } from 'drizzle-orm';
import { db, pool } from '../../db/client';
import { runWithTenant } from '../../db/tenantContext';
import { runSeed, type SeedDataset } from '../seedKit';

/**
 * The property that makes automatic staging seeding safe (ADR-122): **a second run creates
 * nothing and changes nothing**, including a record somebody edited by hand in between.
 *
 * This runs the real engine against a real database, on a throwaway tenant of its own with the
 * clinical story switched off — the story is a minute of work and is already guarded twice; what
 * is worth asserting here is the part that runs on every deployment.
 *
 * Skips (rather than fails) without a database, like the RLS suite, so `npm test` stays green on
 * a machine with no PostgreSQL while CI enforces it for real.
 */

const CODE = 'SEEDIDEM';
let ready = false;
let skipReason = 'no DATABASE_URL / TEST_DATABASE_URL set';

const DATASET: SeedDataset = {
  environment: 'development',
  password: 'SeedTest#2026',
  tenants: [
    {
      code: CODE,
      name: 'Seed Idempotency Hospital',
      kind: 'hospital',
      modules: ['patient', 'appointment', 'opd', 'billing', 'laboratory', 'pharmacy'],
      profile: { city: 'Ahmedabad', addressLine1: '1 Seed Road', country: 'India' },
      branding: { brandColor: '#0F766E' },
      selfRegistration: true,
      branches: [{ code: 'SI-MAIN', name: 'Seed Main' }],
      departments: [{ code: 'SI-GEN', name: 'General Medicine', specialty: 'general_medicine' }],
      users: [
        { email: 'seedidem.admin@example.com', fullName: 'Seed Admin', role: 'org_admin' },
        {
          email: 'seedidem.reception@example.com',
          fullName: 'Seed Reception',
          role: 'receptionist',
        },
        { email: 'seedidem.cashier@example.com', fullName: 'Seed Cashier', role: 'cashier' },
      ],
      services: [{ code: 'SI-DRESS', name: 'Dressing', pricePaise: 15000, department: 'SI-GEN' }],
      labTests: [{ name: 'Haemoglobin', code: 'SI-HB', pricePaise: 20000 }],
      patients: [
        {
          firstName: 'Seed',
          lastName: 'Patient',
          gender: 'female',
          dateOfBirth: '1990-01-01',
          phone: '+919000900001',
        },
      ],
      registrationRequests: [
        { firstName: 'Seed', lastName: 'Walkin', phone: '+919000900002', decision: 'pending' },
      ],
      // No clinical history: this suite is about the part that runs on every deployment.
      story: false,
    },
  ],
};

/** Row counts for the tables this dataset touches, scoped to its own tenant. */
async function snapshot(tenantId: string): Promise<Record<string, number>> {
  const tables = [
    'users',
    'branches',
    'departments',
    'services',
    'lab_tests',
    'patients',
    'registration_requests',
    'notification_log',
    'user_permission_overrides',
  ];
  const out: Record<string, number> = {};
  for (const t of tables) {
    const rows = await pool.query<{ n: string }>(
      `select count(*)::int as n from "${t}" where tenant_id = $1`,
      [tenantId],
    );
    out[t] = Number(rows.rows[0]?.n ?? 0);
  }
  return out;
}

async function tenantId(): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`select id from tenants where code = ${CODE} limit 1`,
  );
  return rows.rows[0]!.id;
}

beforeAll(async () => {
  if (!(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL)) return;
  try {
    await pool.query('select 1');
    ready = true;
  } catch (err) {
    skipReason = `database unreachable: ${(err as Error).message}`;
  }
}, 60_000);

afterAll(async () => {
  // Clean up as far as the product's own rules allow. `audit_log` is append-only at the database
  // level (invariant #6) and `tenants` is referenced from it with ON DELETE RESTRICT, so the
  // tenant row outlives the suite — deliberately. Fighting that protection from a test would be
  // teaching the wrong lesson: CI's database is thrown away after the run, and a developer is
  // left with one clearly-named fixture hospital holding nothing.
  if (!ready) return;
  const rows = await db.execute<{ id: string }>(
    sql`select id from tenants where code = ${CODE} limit 1`,
  );
  const id = rows.rows[0]?.id;
  if (!id) return;
  await pool.query('delete from seed_markers where tenant_code = $1', [CODE]);
  for (const t of [
    'registration_requests',
    'notification_log',
    'user_permission_overrides',
    'user_roles',
    'services',
    'lab_tests',
    'patients',
    'departments',
    'branches',
    'role_permissions',
    'roles',
    'tenant_entitlements',
    'tenant_branding',
    'organization_profile',
    'users',
  ]) {
    await pool.query(`delete from "${t}" where tenant_id = $1`, [id]);
  }
  try {
    await pool.query('delete from tenants where id = $1', [id]);
  } catch {
    // Its audit trail outlives it, which is the rule working, not a failure.
  }
}, 60_000);

describe('seeding twice (ADR-122)', () => {
  test('a second run creates nothing and preserves a hand edit', async () => {
    if (!ready) {
      // eslint-disable-next-line no-console
      console.warn(`[seed idempotency] SKIPPED — ${skipReason}`);
      return;
    }

    await runSeed(DATASET);
    const id = await tenantId();
    const first = await snapshot(id);
    expect(first.users).toBe(3);
    expect(first.patients).toBe(1);
    expect(first.services).toBe(1);
    expect(first.registration_requests).toBe(1);

    // Somebody edits staging by hand: a renamed patient, a repriced service, a corrected city,
    // a public form switched off, and a disabled account.
    await runWithTenant(id, async (tx) => {
      await tx.execute(sql`update patients set first_name = 'Edited' where tenant_id = ${id}`);
      await tx.execute(
        sql`update services set price_paise = 99999, name = 'Edited service' where tenant_id = ${id}`,
      );
      await tx.execute(
        sql`update organization_profile set city = 'Edited city' where tenant_id = ${id}`,
      );
      await tx.execute(
        sql`update tenant_branding set brand_color = '#123456' where tenant_id = ${id}`,
      );
      await tx.execute(sql`update users set status = 'inactive' where tenant_id = ${id}`);
    });

    await runSeed(DATASET);

    const second = await snapshot(id);
    expect(second).toEqual(first);

    const after = await runWithTenant(id, (tx) =>
      tx.execute<{
        name: string;
        price: string;
        city: string;
        colour: string;
        inactive: number;
      }>(sql`
        select (select first_name from patients where tenant_id = ${id} limit 1) as name,
               (select price_paise from services where tenant_id = ${id} limit 1) as price,
               (select city from organization_profile where tenant_id = ${id} limit 1) as city,
               (select brand_color from tenant_branding where tenant_id = ${id} limit 1) as colour,
               (select count(*)::int from users where tenant_id = ${id} and status = 'inactive') as inactive`),
    );
    const row = after.rows[0]!;
    expect(row.name).toBe('Edited');
    expect(Number(row.price)).toBe(99999);
    expect(row.city).toBe('Edited city');
    expect(row.colour).toBe('#123456');
    expect(Number(row.inactive)).toBe(3);
  }, 180_000);

  test('a record added to the dataset later reaches an already-seeded tenant', async () => {
    if (!ready) return;
    const id = await tenantId();

    const extended: SeedDataset = {
      ...DATASET,
      tenants: [
        {
          ...DATASET.tenants[0]!,
          services: [
            ...DATASET.tenants[0]!.services!,
            { code: 'SI-NEBU', name: 'Nebulisation', pricePaise: 20000, department: 'SI-GEN' },
          ],
          labTests: [
            ...DATASET.tenants[0]!.labTests!,
            { name: 'Blood Sugar', code: 'SI-FBS', pricePaise: 15000 },
          ],
        },
      ],
    };
    await runSeed(extended);

    const after = await snapshot(id);
    expect(after.services).toBe(2);
    expect(after.lab_tests).toBe(2);

    // …and the edited one is still edited, not restored from the dataset.
    const rows = await runWithTenant(id, (tx) =>
      tx.execute<{ price: string }>(
        sql`select price_paise as price from services where tenant_id = ${id} and code = 'SI-DRESS'`,
      ),
    );
    expect(Number(rows.rows[0]!.price)).toBe(99999);
  }, 180_000);
});
