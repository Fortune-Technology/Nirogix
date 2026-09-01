import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { runWithTenant } from '../db/tenantContext';
import { tenants, users } from '../db/schema';
import { hashPassword } from '../modules/auth/password';
import { passwordIssues } from '../modules/auth/passwordPolicy';
import {
  seedPermissionCatalog,
  provisionTenantRbac,
  assignRoleByKey,
  reconcileSystemRoles,
} from '../modules/rbac/rbac.service';
import { seedSpecialtyCatalog } from '../modules/provider/provider.service';
import { seedReferenceCatalog } from '../modules/catalog/catalog.service';
import { requireEnvironment, describeTarget, SeedRefused } from './seedGuard';

/**
 * **The production seeder** (ADR-058, ADR-114). One file, one environment — the third and
 * last of the three seeders, and the only one production will ever run.
 *
 * **Bootstrap configuration only.** The permission catalogue, the specialty catalogue,
 * the system roles, and — only when explicitly asked for — the vendor's own PLATFORM
 * organization with a first operator account.
 *
 * What this file must never contain, and what a reviewer should reject on sight:
 * a hospital, a branch, a department, a provider, a patient, an appointment, an
 * invoice, or any other record describing a person or a place. Those are created by
 * real people through the product, and a seeded one is indistinguishable from a real
 * one a week later.
 *
 * Two things this file deliberately does NOT have, and must not grow:
 *
 * - **It does not import the demo-data engine.** `seedKit.ts` builds hospitals, patients and
 *   clinical histories; production has no use for any of it, so the import is absent rather
 *   than merely unused. There is no flag, no environment variable and no code path here that
 *   reaches demo data.
 * - **It has no `--reset`.** The development and staging seeders can empty their database and
 *   start again. Production data is the hospital's clinical record; nothing in this repository
 *   is allowed to truncate it.
 *
 * Run it as:
 *
 *     CONFIRM_PRODUCTION_SEED=yes npm run db:seed:production --workspace=hms_backend
 *
 * It is idempotent: running it twice changes nothing the second time.
 */

/** Platform-operator bootstrap. Absent from the environment means "do not create one". */
const BOOTSTRAP_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
const BOOTSTRAP_NAME = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Platform Owner';
const BOOTSTRAP_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD;

const PLATFORM_CODE = 'NIROGIX';
const PLATFORM_NAME = process.env.BOOTSTRAP_PLATFORM_NAME?.trim() || 'Nirogix';

/**
 * The vendor's own organization — not a hospital. It holds the operators who onboard
 * hospitals (ADR-022), so it has no modules, no branches and no clinical data.
 */
async function ensurePlatformOrg(): Promise<string> {
  const existing = (await db.select().from(tenants).where(eq(tenants.code, PLATFORM_CODE)).limit(1))[0];
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`  platform org ${PLATFORM_CODE} already exists`);
    await provisionTenantRbac(existing.id);
    return existing.id;
  }
  const created = (await db.insert(tenants).values({ code: PLATFORM_CODE, name: PLATFORM_NAME }).returning())[0]!;
  await provisionTenantRbac(created.id);
  // eslint-disable-next-line no-console
  console.log(`  created platform org ${PLATFORM_CODE}`);
  return created.id;
}

/**
 * The first operator. Refuses a weak or absent password rather than inventing one —
 * a known default in production is worse than no account, because the account is real
 * and reachable while the password is guessable.
 */
async function ensureBootstrapAdmin(platformTenantId: string): Promise<void> {
  if (!BOOTSTRAP_EMAIL) {
    // eslint-disable-next-line no-console
    console.log('  no BOOTSTRAP_ADMIN_EMAIL set — skipping operator account (this is fine on a re-run)');
    return;
  }

  const existing = await runWithTenant(platformTenantId, (tx) =>
    tx.select({ id: users.id }).from(users).where(eq(users.email, BOOTSTRAP_EMAIL)).limit(1),
  );
  if (existing[0]) {
    // eslint-disable-next-line no-console
    console.log(`  operator ${BOOTSTRAP_EMAIL} already exists — leaving it untouched`);
    return;
  }

  if (!BOOTSTRAP_PASSWORD) {
    throw new SeedRefused(
      'BOOTSTRAP_ADMIN_EMAIL is set but BOOTSTRAP_ADMIN_PASSWORD is missing. Refusing to create ' +
        'a production account without a password.',
    );
  }
  // The same policy the product enforces on every other password (ADR-082) — the first
  // account on a production platform is the last one that should get an exemption.
  const issues = passwordIssues(BOOTSTRAP_PASSWORD, {
    email: BOOTSTRAP_EMAIL,
    fullName: BOOTSTRAP_NAME,
    orgCode: PLATFORM_CODE,
  });
  if (issues.length > 0) {
    throw new SeedRefused(
      `BOOTSTRAP_ADMIN_PASSWORD does not meet the password policy: ${issues.join(' ')}`,
    );
  }

  const passwordHash = await hashPassword(BOOTSTRAP_PASSWORD);
  const created = await runWithTenant(platformTenantId, (tx) =>
    tx
      .insert(users)
      .values({
        tenantId: platformTenantId,
        email: BOOTSTRAP_EMAIL,
        passwordHash,
        fullName: BOOTSTRAP_NAME,
        status: 'active',
      })
      .returning({ id: users.id }),
  );
  await assignRoleByKey(platformTenantId, created[0]!.id, 'super_admin');
  // eslint-disable-next-line no-console
  console.log(`  created operator ${BOOTSTRAP_EMAIL} — change this password at first sign-in`);
}

async function main(): Promise<void> {
  requireEnvironment('production');
  // eslint-disable-next-line no-console
  console.log(describeTarget('production'));

  // Catalogues: the permission keys and specialty codes the application enforces
  // against. Additive and idempotent — this is the part that must run on every deploy
  // so a permission added in code is held by somebody.
  await seedPermissionCatalog();
  await seedSpecialtyCatalog();
  await seedReferenceCatalog();
  // eslint-disable-next-line no-console
  console.log('  permission + specialty + master-data catalogues up to date');

  const reconciled = await reconcileSystemRoles();
  // eslint-disable-next-line no-console
  console.log(`  system roles reconciled across ${reconciled.tenants} tenant(s)`);

  const platformTenantId = await ensurePlatformOrg();
  await ensureBootstrapAdmin(platformTenantId);

  // eslint-disable-next-line no-console
  console.log('\nDone. Bootstrap configuration only — no hospitals, patients or appointments were created.');

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  if (err instanceof SeedRefused) {
    // eslint-disable-next-line no-console
    console.error(`\nseed refused: ${err.message}\n`);
    process.exit(2);
  }
  // eslint-disable-next-line no-console
  console.error('production seed failed:', err);
  process.exit(1);
});
