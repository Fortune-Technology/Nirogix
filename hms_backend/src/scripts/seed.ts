import 'dotenv/config';
import { and, count, eq, isNull } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { runWithTenant } from '../db/tenantContext';
import {
  tenants,
  branches,
  departments,
  users,
  providers,
  patients as patientsTable,
  labTests as labTestsTable,
  drugs as drugsTable,
} from '../db/schema';
import { hashPassword } from '../modules/auth/password';
import { seedPermissionCatalog, provisionTenantRbac, assignRoleByKey } from '../modules/rbac/rbac.service';
import { grantModule } from '../modules/entitlement/entitlement.service';
import { seedSpecialtyCatalog, createProvider, assignSpecialty } from '../modules/provider/provider.service';
import { seedReferenceCatalog } from '../modules/catalog/catalog.service';
import { createPatient, countPatients, type PatientInput } from '../modules/patient/patient.service';
import { bookAppointment, countAppointments } from '../modules/appointment/appointment.service';
import { createTest, type CreateTestInput } from '../modules/laboratory/laboratory.service';
import { createDrug, receiveStock, type CreateDrugInput } from '../modules/pharmacy/pharmacy.service';
import { createService, type ServiceInput } from '../modules/billing/billing.service';
import { services as servicesTable } from '../db/schema';
import { requireEnvironment, describeTarget, SeedRefused } from './seedGuard';

// Multi-tenant demo seed (Phase 0 Ops / Task #14). Idempotent. Seeds one PLATFORM org (the Nirogix
// platform operator — home of the System Super Admins who onboard hospitals; ADR-022) plus 2+
// demo hospital tenants, each with a branch layout and one user per role, so login + RBAC + tenant
// isolation can be exercised and demoed end-to-end. All hospital data reflects a genuine Indian
// healthcare context (resources/development-plan.md §17 Test Data). NOT production data — passwords
// are known dev defaults. The full production-grade demo dataset expands here later.

const DEFAULT_PASSWORD = 'ChangeMe#123';

// The MVP modules, in hard-dependency order (grantModule enforces deps).
// The MVP modules plus `abdm` (ADR-084): a development hospital should be able to exercise ABHA
// verification without a manual entitlement grant. Safe anywhere this seeder is allowed to run —
// it refuses outside development, and `ABDM_PROVIDER` defaults to the offline mock.
const MVP_MODULES = ['patient', 'appointment', 'opd', 'emr', 'pharmacy', 'laboratory', 'billing', 'abdm'];

interface SeedProvider {
  fullName: string;
  qualification: string;
  registrationNumber: string;
  specialty: string;
  /** Email of the seeded user to link this provider to (optional). */
  userEmail?: string;
  /** Default OPD consultation fee in paise — what check-in charges when no override is given. */
  consultationFeePaise?: number;
}

type SeedDrug = CreateDrugInput & { stockQty: number; batchNo: string; expiryDate: string };

// Shared demo catalogs (Indian OPD context, prices in paise, taxes kept at 0 for clean demo
// receipts). Every hospital entitled to the module gets them, so a fresh seed can run the whole
// journey — prescribe from a drug master, order from a test master, dispense against stock.
const SEED_LAB_TESTS: CreateTestInput[] = [
  { name: 'Hemoglobin', code: 'HB', sampleType: 'blood', unit: 'g/dL', refLow: '12', refHigh: '17', pricePaise: 20000 },
  { name: 'Fasting Blood Sugar', code: 'FBS', sampleType: 'blood', unit: 'mg/dL', refLow: '70', refHigh: '110', pricePaise: 15000 },
  { name: 'Lipid Profile', code: 'LIPID', sampleType: 'blood', unit: null, refLow: null, refHigh: null, pricePaise: 60000 },
  { name: 'Thyroid Stimulating Hormone', code: 'TSH', sampleType: 'blood', unit: 'µIU/mL', refLow: '0.4', refHigh: '4.2', pricePaise: 35000 },
  { name: 'Urine Routine', code: 'URINE-R', sampleType: 'urine', unit: null, refLow: null, refHigh: null, pricePaise: 12000 },
];

const SEED_SERVICES: ServiceInput[] = [
  { code: 'DRESS-S', name: 'Dressing (small)', pricePaise: 15000 },
  { code: 'INJ-IM', name: 'Injection (IM)', pricePaise: 5000 },
  { code: 'NEBU', name: 'Nebulization', pricePaise: 20000 },
  { code: 'FOLLOWUP', name: 'Follow-up consultation', pricePaise: 20000 },
];

const SEED_DRUGS: SeedDrug[] = [
  { name: 'Paracetamol 500 mg', form: 'tablet', strength: '500 mg', unit: 'tablet', unitPricePaise: 200, stockQty: 500, batchNo: 'PCM-2601', expiryDate: '2027-03-31' },
  { name: 'Amoxicillin 500 mg', form: 'capsule', strength: '500 mg', unit: 'capsule', unitPricePaise: 1200, stockQty: 300, batchNo: 'AMX-2602', expiryDate: '2027-06-30' },
  { name: 'Cetirizine 10 mg', form: 'tablet', strength: '10 mg', unit: 'tablet', unitPricePaise: 300, stockQty: 400, batchNo: 'CTZ-2603', expiryDate: '2027-01-31' },
  { name: 'Pantoprazole 40 mg', form: 'tablet', strength: '40 mg', unit: 'tablet', unitPricePaise: 800, stockQty: 350, batchNo: 'PAN-2604', expiryDate: '2026-12-31' },
  { name: 'ORS Sachet 21 g', form: 'sachet', strength: '21 g', unit: 'sachet', unitPricePaise: 1800, stockQty: 200, batchNo: 'ORS-2605', expiryDate: '2027-05-31' },
];

interface SeedTenant {
  code: string;
  name: string;
  /** Initial module entitlements; defaults to the MVP set. The PLATFORM org gets none (not a hospital). */
  modules?: string[];
  branches: Array<{ code: string; name: string }>;
  /** Clinical departments (ADR-050). Organization-wide; a group could scope them per branch. */
  departments?: Array<{ code: string; name: string; specialty?: string }>;
  /** One user per role — email, display name, and the system role key. */
  users: Array<{ email: string; fullName: string; role: string }>;
  providers: SeedProvider[];
  /** A few demo patients (Indian context). Only seeded when the tenant has none. */
  patients?: PatientInput[];
}

// The PLATFORM org (the vendor) + demo hospital tenants across different Indian states.
const SEED_TENANTS: SeedTenant[] = [
  {
    // Tier 0 — the Nirogix platform operator. Home of the System Super Admins, who operate ACROSS
    // all tenants and onboard hospitals. Not a hospital: no modules, branches, or clinical data
    // (ADR-022). Two Platform Admins so the platform is never down to a single operator account.
    code: 'NIROGIX',
    name: 'Nirogix',
    modules: [],
    branches: [],
    users: [
      { email: 'jaivik@thefortunetech.com', fullName: 'Jaivik Patel', role: 'super_admin' },
      { email: 'nishant@thefortunetech.com', fullName: 'Nishant Patel', role: 'super_admin' },
    ],
    providers: [],
  },
  {
    code: 'CITYCARE',
    name: 'CityCare Multispeciality Hospital',
    // Pune, Maharashtra.
    branches: [
      { code: 'KTD', name: 'Kothrud (Main)' },
      { code: 'BNR', name: 'Baner' },
    ],
    departments: [
      { code: 'GENMED', name: 'General Medicine', specialty: 'general_medicine' },
      { code: 'CARDIO', name: 'Cardiology', specialty: 'cardiology' },
      // Specialty codes come from the catalog (US-spelled there): the display name stays Indian
      // English, the code must match `SPECIALTY_CODES` or providers can never be matched to it.
      { code: 'ORTHO', name: 'Orthopaedics', specialty: 'orthopedics' },
      { code: 'PAEDS', name: 'Paediatrics', specialty: 'pediatrics' },
    ],
    users: [
      // A hospital has no System Super Admin — that role belongs to the PLATFORM org (ADR-022).
      // admin@ / reception@ are kept stable — existing manual QA + docs reference them.
      { email: 'admin@citycare.example', fullName: 'Dr. Ananya Sharma', role: 'org_admin' },
      { email: 'branchadmin@citycare.example', fullName: 'Suresh Iyer', role: 'branch_admin' },
      { email: 'doctor@citycare.example', fullName: 'Dr. Rajesh Gupta', role: 'doctor' },
      { email: 'reception@citycare.example', fullName: 'Rahul Verma', role: 'receptionist' },
      { email: 'pharmacist@citycare.example', fullName: 'Meena Nair', role: 'pharmacist' },
      { email: 'lab@citycare.example', fullName: 'Karthik Menon', role: 'lab_technician' },
      { email: 'cashier@citycare.example', fullName: 'Pooja Deshmukh', role: 'cashier' },
    ],
    providers: [
      {
        fullName: 'Dr. Ananya Sharma',
        qualification: 'MBBS, MD',
        registrationNumber: 'MMC-2011-04821',
        specialty: 'cardiology',
        userEmail: 'admin@citycare.example',
        consultationFeePaise: 80000, // ₹800
      },
      {
        fullName: 'Dr. Rajesh Gupta',
        qualification: 'MBBS, MD (General Medicine)',
        registrationNumber: 'MMC-2014-11733',
        specialty: 'general_medicine',
        userEmail: 'doctor@citycare.example',
        consultationFeePaise: 50000, // ₹500
      },
    ],
    patients: [
      { firstName: 'Aarav', lastName: 'Kulkarni', gender: 'male', dateOfBirth: '1990-04-12', phone: '9820011234', bloodGroup: 'B+', city: 'Pune', state: 'Maharashtra', pincode: '411038' },
      { firstName: 'Isha', lastName: 'Deshpande', gender: 'female', dateOfBirth: '1985-11-03', phone: '9822045678', bloodGroup: 'O+', city: 'Pune', state: 'Maharashtra', pincode: '411045' },
      { firstName: 'Vivaan', lastName: 'Patil', gender: 'male', dateOfBirth: '2015-06-20', phone: '9821099887', bloodGroup: 'A+', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
    ],
  },
  {
    code: 'SUNRISE',
    name: 'Sunrise Diagnostics & Polyclinic',
    // Ahmedabad, Gujarat.
    branches: [
      { code: 'STL', name: 'Satellite (Main)' },
      { code: 'MNG', name: 'Maninagar' },
    ],
    departments: [
      { code: 'GENMED', name: 'General Medicine', specialty: 'general_medicine' },
      { code: 'RADIO', name: 'Radiology', specialty: 'radiology' },
    ],
    users: [
      { email: 'admin@sunrise.example', fullName: 'Dr. Priya Patel', role: 'org_admin' },
      { email: 'branchadmin@sunrise.example', fullName: 'Amit Shah', role: 'branch_admin' },
      { email: 'doctor@sunrise.example', fullName: 'Dr. Sanjay Desai', role: 'doctor' },
      { email: 'reception@sunrise.example', fullName: 'Neha Joshi', role: 'receptionist' },
      { email: 'pharmacist@sunrise.example', fullName: 'Kiran Modi', role: 'pharmacist' },
      { email: 'lab@sunrise.example', fullName: 'Harish Trivedi', role: 'lab_technician' },
      { email: 'cashier@sunrise.example', fullName: 'Divya Mehta', role: 'cashier' },
    ],
    providers: [
      {
        fullName: 'Dr. Sanjay Desai',
        qualification: 'MBBS, MD (Radiodiagnosis)',
        registrationNumber: 'GMC-2012-07655',
        specialty: 'radiology',
        userEmail: 'doctor@sunrise.example',
        consultationFeePaise: 60000, // ₹600
      },
    ],
    patients: [
      { firstName: 'Rajesh', lastName: 'Chaudhary', gender: 'male', dateOfBirth: '1978-07-22', phone: '9898012345', bloodGroup: 'A+', city: 'Ahmedabad', state: 'Gujarat', pincode: '380015' },
      { firstName: 'Meera', lastName: 'Shah', gender: 'female', dateOfBirth: '1992-02-14', phone: '9898067890', bloodGroup: 'AB+', city: 'Ahmedabad', state: 'Gujarat', pincode: '380009' },
    ],
  },
];

async function upsertUser(
  tenantId: string,
  u: { email: string; fullName: string },
): Promise<string> {
  return runWithTenant(tenantId, async (tx) => {
    const existing = (await tx.select().from(users).where(eq(users.email, u.email)).limit(1))[0];
    if (existing) return existing.id;
    const passwordHash = await hashPassword(DEFAULT_PASSWORD);
    const inserted = (
      await tx
        .insert(users)
        .values({ tenantId, email: u.email, passwordHash, fullName: u.fullName, status: 'active' })
        .returning()
    )[0]!;
    return inserted.id;
  });
}

async function upsertBranch(
  tenantId: string,
  b: { code: string; name: string },
): Promise<void> {
  await runWithTenant(tenantId, async (tx) => {
    const existing = (
      await tx
        .select()
        .from(branches)
        .where(and(eq(branches.tenantId, tenantId), eq(branches.code, b.code)))
        .limit(1)
    )[0];
    if (!existing) {
      await tx.insert(branches).values({ tenantId, code: b.code, name: b.name });
    }
  });
}

async function seedDepartment(
  tenantId: string,
  d: { code: string; name: string; specialty?: string },
): Promise<void> {
  await runWithTenant(tenantId, async (tx) => {
    const existing = (
      await tx
        .select()
        .from(departments)
        .where(and(eq(departments.tenantId, tenantId), eq(departments.code, d.code)))
        .limit(1)
    )[0];
    if (!existing) {
      await tx
        .insert(departments)
        .values({ tenantId, code: d.code, name: d.name, specialtyCode: d.specialty ?? null });
    }
  });
}

async function seedTenant(t: SeedTenant): Promise<void> {
  // Tenant (platform-managed; no RLS).
  let tenant = (await db.select().from(tenants).where(eq(tenants.code, t.code)).limit(1))[0];
  if (!tenant) {
    tenant = (await db.insert(tenants).values({ code: t.code, name: t.name }).returning())[0]!;
    // eslint-disable-next-line no-console
    console.log(`Created tenant "${tenant.name}" (${t.code})`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`Tenant "${t.code}" already exists`);
  }

  await provisionTenantRbac(tenant.id);

  for (const b of t.branches) await upsertBranch(tenant.id, b);

  for (const d of t.departments ?? []) await seedDepartment(tenant.id, d);

  for (const m of t.modules ?? MVP_MODULES) await grantModule(tenant.id, m, { reason: 'demo seed' });

  const userIdByEmail = new Map<string, string>();
  for (const u of t.users) {
    const userId = await upsertUser(tenant.id, u);
    await assignRoleByKey(tenant.id, userId, u.role);
    userIdByEmail.set(u.email, userId);
  }
  // eslint-disable-next-line no-console
  console.log(`  ${t.users.length} users (one per role), ${t.branches.length} branches, modules granted`);

  // Providers (FHIR Practitioner + a PractitionerRole specialty).
  for (const p of t.providers) {
    const linkedUserId = p.userEmail ? userIdByEmail.get(p.userEmail) : undefined;
    const existing = linkedUserId
      ? await runWithTenant(tenant.id, (tx) =>
          tx
            .select()
            .from(providers)
            .where(and(eq(providers.tenantId, tenant.id), eq(providers.userId, linkedUserId)))
            .limit(1),
        )
      : [];
    if (existing.length === 0) {
      const prov = await createProvider(tenant.id, {
        fullName: p.fullName,
        userId: linkedUserId,
        qualification: p.qualification,
        registrationNumber: p.registrationNumber,
        consultationFeePaise: p.consultationFeePaise ?? null,
      });
      await assignSpecialty(tenant.id, prov.id, { specialtyCode: p.specialty, isPrimary: true });
    } else if (existing[0] && existing[0].consultationFeePaise === null && p.consultationFeePaise !== undefined) {
      // Idempotent upgrade for databases seeded before fees existed.
      await runWithTenant(tenant.id, (tx) =>
        tx
          .update(providers)
          .set({ consultationFeePaise: p.consultationFeePaise, updatedAt: new Date() })
          .where(and(eq(providers.id, existing[0]!.id), isNull(providers.consultationFeePaise))),
      );
    }
  }
  // eslint-disable-next-line no-console
  console.log(`  ${t.providers.length} providers seeded`);

  // Clinical catalogs — the lab test master and drug master (with opening stock) every demo of
  // the full journey needs. Idempotent: seeded only while the tenant's catalog is empty.
  const modulesGranted = t.modules ?? MVP_MODULES;
  if (modulesGranted.includes('laboratory')) {
    const testCount = Number(
      (await runWithTenant(tenant.id, (tx) => tx.select({ c: count() }).from(labTestsTable).where(eq(labTestsTable.tenantId, tenant.id))))[0]?.c ?? 0,
    );
    if (testCount === 0) {
      for (const lt of SEED_LAB_TESTS) await createTest(tenant.id, lt);
      // eslint-disable-next-line no-console
      console.log(`  ${SEED_LAB_TESTS.length} lab tests seeded`);
    }
  }
  if (modulesGranted.includes('billing')) {
    const svcCount = Number(
      (await runWithTenant(tenant.id, (tx) => tx.select({ c: count() }).from(servicesTable).where(eq(servicesTable.tenantId, tenant.id))))[0]?.c ?? 0,
    );
    if (svcCount === 0) {
      for (const s of SEED_SERVICES) await createService(tenant.id, s);
      // eslint-disable-next-line no-console
      console.log(`  ${SEED_SERVICES.length} services seeded`);
    }
  }
  if (modulesGranted.includes('pharmacy')) {
    const drugCount = Number(
      (await runWithTenant(tenant.id, (tx) => tx.select({ c: count() }).from(drugsTable).where(eq(drugsTable.tenantId, tenant.id))))[0]?.c ?? 0,
    );
    if (drugCount === 0) {
      for (const d of SEED_DRUGS) {
        const { stockQty, batchNo, expiryDate, ...drugInput } = d;
        const created = await createDrug(tenant.id, drugInput);
        if (created) await receiveStock(tenant.id, created.id, { batchNo, expiryDate, quantity: stockQty });
      }
      // eslint-disable-next-line no-console
      console.log(`  ${SEED_DRUGS.length} drugs seeded with opening stock`);
    }
  }

  // Demo patients — only when the tenant has none (idempotent; UHIDs auto-assigned).
  if (t.patients?.length && (await countPatients(tenant.id)) === 0) {
    for (const p of t.patients) await createPatient(tenant.id, p);
    // eslint-disable-next-line no-console
    console.log(`  ${t.patients.length} patients seeded`);
  }

  // One demo appointment (first patient with first provider, tomorrow 10:00) — idempotent.
  const modules = t.modules ?? MVP_MODULES;
  if (modules.includes('appointment') && (await countAppointments(tenant.id)) === 0) {
    const firstPatient = (
      await runWithTenant(tenant.id, (tx) => tx.select({ id: patientsTable.id }).from(patientsTable).where(eq(patientsTable.tenantId, tenant.id)).limit(1))
    )[0];
    const firstProvider = (
      await runWithTenant(tenant.id, (tx) => tx.select({ id: providers.id }).from(providers).where(eq(providers.tenantId, tenant.id)).limit(1))
    )[0];
    if (firstPatient && firstProvider) {
      const at = new Date();
      at.setDate(at.getDate() + 1);
      at.setHours(10, 0, 0, 0);
      await bookAppointment(tenant.id, {
        patientId: firstPatient.id,
        providerId: firstProvider.id,
        scheduledAt: at.toISOString(),
        reason: 'Follow-up consultation',
      });
      // eslint-disable-next-line no-console
      console.log('  1 appointment seeded');
    }
  }
}

async function main(): Promise<void> {
  // Refuses outright unless this really is a development database (ADR-058). The
  // dataset below invents hospitals, doctors and patients; against a live database
  // that is unrecoverable, so the check comes before the first write.
  requireEnvironment('development');
  // eslint-disable-next-line no-console
  console.log(describeTarget('development'));

  await seedPermissionCatalog();
  await seedSpecialtyCatalog();
  await seedReferenceCatalog();
  // eslint-disable-next-line no-console
  console.log('Seeded permission + specialty + master-data catalogs');

  for (const t of SEED_TENANTS) await seedTenant(t);

  // eslint-disable-next-line no-console
  console.log(
    `\nDone. 1 platform org + ${SEED_TENANTS.length - 1} demo hospitals. Login with org code + email + password "${DEFAULT_PASSWORD}".`,
  );
  // eslint-disable-next-line no-console
  console.log('Platform admins: PLATFORM / jaivik@thefortunetech.com  ·  nishant@thefortunetech.com');
  // eslint-disable-next-line no-console
  console.log('Hospital admin: CITYCARE / admin@citycare.example  ·  SUNRISE / admin@sunrise.example');

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  // A refusal is a correct outcome, not a crash — say so plainly rather than
  // printing a stack trace that invites someone to "fix" the guard.
  if (err instanceof SeedRefused) {
    // eslint-disable-next-line no-console
    console.error(`
seed refused: ${err.message}
`);
    process.exit(2);
  }
  // eslint-disable-next-line no-console
  console.error('seed failed:', err);
  process.exit(1);
});
