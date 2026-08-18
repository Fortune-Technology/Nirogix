import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { runWithTenant } from '../db/tenantContext';
import { tenants, branches, departments, users } from '../db/schema';
import { hashPassword } from '../modules/auth/password';
import {
  seedPermissionCatalog,
  provisionTenantRbac,
  assignRoleByKey,
  reconcileSystemRoles,
} from '../modules/rbac/rbac.service';
import { grantModule } from '../modules/entitlement/entitlement.service';
import { seedSpecialtyCatalog, createProvider, assignSpecialty } from '../modules/provider/provider.service';
import { seedReferenceCatalog } from '../modules/catalog/catalog.service';
import { createPatient, countPatients } from '../modules/patient/patient.service';
import { requireEnvironment, describeTarget, SeedRefused } from './seedGuard';

/**
 * The staging seeder (ADR-058).
 *
 * Shaped like production, sized for QA — and above all **deterministic**. Automated
 * E2E and regression tests assert against these exact values, so this file is a
 * contract: changing a name, a code or an ordering breaks assertions elsewhere, and
 * that is the intended trade. Nothing here is random, and nothing depends on the
 * clock.
 *
 * Deliberately smaller than the development dataset. Staging exists to prove that a
 * workflow works, not to look busy — one hospital, two branches, one provider per
 * department, and a handful of patients whose details are obviously synthetic.
 *
 * As with every environment: **no real patient information, ever.**
 */

// Fixed and known, because tests sign in with them. Staging sits behind access control
// (deploy/README.md) and is never reachable from the public internet.
const STAGING_PASSWORD = 'StagingOnly#2026';

const TENANT = {
  code: 'QAHOSP',
  name: 'QA General Hospital',
  modules: ['patient', 'appointment', 'opd', 'emr', 'pharmacy', 'laboratory', 'billing'],
  branches: [
    { code: 'QA-MAIN', name: 'QA Main Campus' },
    { code: 'QA-ANNEX', name: 'QA Annexe Clinic' },
  ],
  departments: [
    { code: 'QA-GEN', name: 'General Medicine', specialty: 'general_medicine' },
    { code: 'QA-CARD', name: 'Cardiology', specialty: 'cardiology' },
  ],
  // One account per role, so every permission boundary is testable in both directions.
  users: [
    { email: 'qa.admin@qahospital.example', fullName: 'QA Org Admin', role: 'org_admin' },
    { email: 'qa.doctor@qahospital.example', fullName: 'QA Doctor', role: 'doctor' },
    { email: 'qa.reception@qahospital.example', fullName: 'QA Receptionist', role: 'receptionist' },
    { email: 'qa.pharmacist@qahospital.example', fullName: 'QA Pharmacist', role: 'pharmacist' },
    { email: 'qa.lab@qahospital.example', fullName: 'QA Lab Technician', role: 'lab_technician' },
    { email: 'qa.cashier@qahospital.example', fullName: 'QA Cashier', role: 'cashier' },
  ],
  providers: [
    {
      fullName: 'Dr QA Physician',
      qualification: 'MBBS, MD',
      registrationNumber: 'QA-REG-0001',
      specialty: 'general_medicine',
      userEmail: 'qa.doctor@qahospital.example',
    },
  ],
  // Obviously synthetic, and fixed so an E2E test can search for "QA Patient One".
  patients: [
    { firstName: 'QA Patient', lastName: 'One', gender: 'female', phone: '+919000000001', city: 'Ahmedabad' },
    { firstName: 'QA Patient', lastName: 'Two', gender: 'male', phone: '+919000000002', city: 'Ahmedabad' },
  ],
};

/** The Nirogix platform-operator org, so operator-side flows are testable too. */
const PLATFORM = {
  code: 'NIROGIX',
  name: 'Nirogix',
  users: [
    { email: 'jaivik@thefortunetech.com', fullName: 'Jaivik Patel', role: 'super_admin' },
    { email: 'nishant@thefortunetech.com', fullName: 'Nishant Patel', role: 'super_admin' },
  ],
};

async function upsertTenant(code: string, name: string): Promise<string> {
  const existing = (await db.select().from(tenants).where(eq(tenants.code, code)).limit(1))[0];
  if (existing) {
    await provisionTenantRbac(existing.id);
    return existing.id;
  }
  const created = (await db.insert(tenants).values({ code, name }).returning())[0]!;
  await provisionTenantRbac(created.id);
  // eslint-disable-next-line no-console
  console.log(`  created tenant ${code}`);
  return created.id;
}

async function upsertUser(tenantId: string, email: string, fullName: string, role: string): Promise<void> {
  const existing = await runWithTenant(tenantId, (tx) =>
    tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1),
  );
  let userId = existing[0]?.id;
  if (!userId) {
    const passwordHash = await hashPassword(STAGING_PASSWORD);
    const created = await runWithTenant(tenantId, (tx) =>
      tx
        .insert(users)
        .values({ tenantId, email, passwordHash, fullName, status: 'active' })
        .returning({ id: users.id }),
    );
    userId = created[0]!.id;
  }
  await assignRoleByKey(tenantId, userId, role);
}

async function upsertBranch(tenantId: string, code: string, name: string): Promise<void> {
  await runWithTenant(tenantId, async (tx) => {
    const existing = (
      await tx.select().from(branches).where(and(eq(branches.tenantId, tenantId), eq(branches.code, code))).limit(1)
    )[0];
    if (!existing) await tx.insert(branches).values({ tenantId, code, name });
  });
}

async function upsertDepartment(tenantId: string, code: string, name: string, specialty: string): Promise<void> {
  await runWithTenant(tenantId, async (tx) => {
    const existing = (
      await tx
        .select()
        .from(departments)
        .where(and(eq(departments.tenantId, tenantId), eq(departments.code, code)))
        .limit(1)
    )[0];
    if (!existing) await tx.insert(departments).values({ tenantId, code, name, specialtyCode: specialty });
  });
}

async function main(): Promise<void> {
  requireEnvironment('staging');
  // eslint-disable-next-line no-console
  console.log(describeTarget('staging'));

  await seedPermissionCatalog();
  await seedSpecialtyCatalog();
  await seedReferenceCatalog();
  await reconcileSystemRoles();
  // eslint-disable-next-line no-console
  console.log('  catalogues + system roles up to date');

  // Vendor org — operators, no modules, no clinical data (ADR-022).
  const platformId = await upsertTenant(PLATFORM.code, PLATFORM.name);
  for (const u of PLATFORM.users) await upsertUser(platformId, u.email, u.fullName, u.role);

  // The QA hospital.
  const tenantId = await upsertTenant(TENANT.code, TENANT.name);
  for (const b of TENANT.branches) await upsertBranch(tenantId, b.code, b.name);
  for (const d of TENANT.departments) await upsertDepartment(tenantId, d.code, d.name, d.specialty);
  for (const m of TENANT.modules) await grantModule(tenantId, m, { reason: 'staging seed' });
  for (const u of TENANT.users) await upsertUser(tenantId, u.email, u.fullName, u.role);

  for (const p of TENANT.providers) {
    const linked = await runWithTenant(tenantId, (tx) =>
      tx.select({ id: users.id }).from(users).where(eq(users.email, p.userEmail)).limit(1),
    );
    const provider = await createProvider(tenantId, {
      fullName: p.fullName,
      qualification: p.qualification,
      registrationNumber: p.registrationNumber,
      userId: linked[0]?.id,
    });
    await assignSpecialty(tenantId, provider.id, { specialtyCode: p.specialty, isPrimary: true });
  }

  // Only when the hospital has none, so a re-run never duplicates or renumbers UHIDs —
  // E2E tests assert on those.
  if ((await countPatients(tenantId)) === 0) {
    // No actor: this is a seeder, not a person. The audit trail records it as such.
    for (const p of TENANT.patients) await createPatient(tenantId, p);
  }

  // eslint-disable-next-line no-console
  console.log(
    `\nDone. Deterministic staging dataset: ${TENANT.code} with ${TENANT.users.length} role accounts, ` +
    `${TENANT.branches.length} branches, ${TENANT.departments.length} departments, ${TENANT.patients.length} patients.`,
  );
  // eslint-disable-next-line no-console
  console.log(`Sign in with ${TENANT.code} / qa.admin@qahospital.example and the staging password.`);

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
  console.error('staging seed failed:', err);
  process.exit(1);
});
