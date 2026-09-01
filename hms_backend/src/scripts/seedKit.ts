/**
 * The shared seeding engine (ADR-058, extended by ADR-114).
 *
 * There are exactly **three seeders — one per environment** — and they are the only files
 * anyone runs or edits:
 *
 *   seed.development.ts   the rich, varied demo dataset every screen is tested against
 *   seed.staging.ts       the deterministic, production-shaped QA dataset
 *   seed.production.ts    bootstrap configuration only — never demo data
 *
 * This file is not a seeder. It is the machinery those three share: the upserts, the
 * catalogue loaders, the clinical-story generator that produces interconnected records
 * (hospital → department → doctor → patient → appointment → check-in → case → vitals →
 * consultation → billing → payment), and the reset. Keeping it here is what lets each
 * environment stay a single readable file that declares *what* its dataset is, while
 * *how* the records are built exists once.
 *
 * Two rules this engine never bends:
 *
 * 1. **Records are created through the real services**, not by hand-writing rows. Numbering,
 *    invoicing, stock deduction, referral consumption, the visit state machine and the audit
 *    trail therefore behave exactly as they do in the product. Where a lifecycle state has no
 *    product action yet (an appointment no-show, a voided invoice, a refunded payment), the
 *    engine sets that column directly and says so at the call site — those are the only
 *    hand-written states, and each is listed in the seed report.
 *
 * 2. **Nothing here decides which database it is pointed at.** That is `seedGuard.ts`, called
 *    by each seeder before its first write.
 */

import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { runWithTenant } from '../db/tenantContext';
import {
  appointmentRequests,
  appointments,
  auditLog,
  branches,
  departments,
  invoices,
  labOrders as labOrdersTable,
  notificationLog,
  patients as patientsTable,
  payments,
  providers,
  registrationRequests,
  services as servicesTable,
  visits,
  tenants,
  users,
} from '../db/schema';
import { hashPassword } from '../modules/auth/password';
import {
  seedPermissionCatalog,
  provisionTenantRbac,
  assignRoleByKey,
  reconcileSystemRoles,
  setOverride,
} from '../modules/rbac/rbac.service';
import { grantModule } from '../modules/entitlement/entitlement.service';
import {
  seedSpecialtyCatalog,
  createProvider,
  assignSpecialty,
  setSchedules,
} from '../modules/provider/provider.service';
import { seedReferenceCatalog } from '../modules/catalog/catalog.service';
import { createPatient, type PatientInput } from '../modules/patient/patient.service';
import { bookAppointment, cancelAppointment } from '../modules/appointment/appointment.service';
import { checkIn, updateStatus } from '../modules/opd/opd.service';
import { getEncounterByVisit, saveEncounter, signEncounter, type SaveEncounterInput } from '../modules/emr/emr.service';
import { createInvoice, createService, recordPayment, type ServiceInput } from '../modules/billing/billing.service';
import { createTest, collectSample, enterResult, verifyResult, type CreateTestInput } from '../modules/laboratory/laboratory.service';
import {
  adjustStock,
  createDrug,
  createSupplier,
  dispense,
  receiveStock,
  type CreateDrugInput,
  type SupplierInput,
} from '../modules/pharmacy/pharmacy.service';
import { createReferral, cancelReferral } from '../modules/referral/referral.service';
import { addImmunization } from '../modules/immunization/immunization.service';
import { updateOrganizationProfile } from '../modules/organization/organization.service';
import { updateBranding } from '../modules/branding/branding.service';
import { setSelfRegistration } from '../modules/organization/registration.service';
import { setOnlineBooking } from '../modules/organization/booking.service';
import { findTenantScopedTables } from '../db/rls';
import type { SeedEnvironment } from './seedGuard';

/* eslint-disable no-console */

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

/**
 * A small seeded PRNG (mulberry32). Every choice the story generator makes runs through
 * this, so a seeder re-run against a fresh database produces the *same* dataset — which is
 * what makes staging a contract E2E can assert against, and a development bug reproducible
 * for the next person.
 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable numeric seed from a tenant code, so two tenants never generate the same story. */
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length]!;

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * The seeder's "today". Fixed once per run so a dataset built over several minutes cannot
 * straddle midnight and end up with a queue split across two days.
 */
export const NOW = new Date();

export function dayOffset(days: number, hour = 10, minute = 0): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// The dataset a seeder declares
// ---------------------------------------------------------------------------

export type SeedUser = {
  email: string;
  fullName: string;
  role: string;
  /** `inactive` seeds a disabled account so the Users table's status filter has both sides. */
  status?: 'active' | 'inactive';
};

export type SeedProvider = {
  fullName: string;
  qualification: string;
  registrationNumber: string;
  specialty: string;
  userEmail?: string;
  consultationFeePaise?: number;
  isActive?: boolean;
  /** Weekly roster; omitted means free-form booking (both are worth having on screen). */
  schedule?: Array<{ weekday: number; startTime: string; endTime: string; slotMinutes?: number }>;
};

export type SeedPatient = PatientInput & {
  /** `inactive` exercises the Patients status filter; the record stays, as clinical records must. */
  status?: 'active' | 'inactive';
  /** Vaccines to record against this patient (paediatric charts, mostly). */
  immunizations?: Array<{ vaccineCode: string; vaccineName: string; dateGiven: string; doseLabel?: string }>;
};

export type SeedDrug = CreateDrugInput & {
  /** Opening batches. More than one exercises FEFO; a near expiry drives the expiry views. */
  batches: Array<{ batchNo: string; expiryDate: string; quantity: number; costPricePaise?: number; supplier?: string }>;
};

export type StoryPlan = {
  /** Days of completed history generated behind today (drives trends, reports, revenue). */
  historyDays: number;
  /** Completed visits per history day. */
  visitsPerDay: number;
  /** How far ahead future appointments are scattered. */
  futureDays: number;
  /** Future appointments to book. */
  futureAppointments: number;
};

export type SeedRequest = {
  firstName: string;
  lastName?: string;
  gender?: string;
  dateOfBirth?: string;
  phone: string;
  email?: string;
  city?: string;
  preferredDate?: string;
  preferredTime?: string;
  note?: string;
  decision: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
};

export type SeedTenantSpec = {
  code: string;
  name: string;
  /** `platform` is the vendor's own org (ADR-022) — operators, no modules, no clinical data. */
  kind: 'platform' | 'hospital';
  status?: 'active' | 'suspended';
  /** Defaults to the BUILT module set for a hospital, none for the platform org. */
  modules?: string[];
  branches?: Array<{ code: string; name: string; isActive?: boolean }>;
  departments?: Array<{ code: string; name: string; specialty?: string; isActive?: boolean }>;
  users: SeedUser[];
  providers?: SeedProvider[];
  patients?: SeedPatient[];
  labTests?: CreateTestInput[];
  services?: Array<ServiceInput & { isActive?: boolean }>;
  drugs?: SeedDrug[];
  suppliers?: SupplierInput[];
  profile?: Record<string, string>;
  branding?: { brandColor?: string; secondaryColor?: string };
  selfRegistration?: boolean;
  onlineBooking?: boolean;
  /** Public-form submissions awaiting (or already given) a decision at the front desk. */
  registrationRequests?: SeedRequest[];
  bookingRequests?: SeedRequest[];
  /** The interconnected clinical history. `false` leaves the tenant configured but empty. */
  story?: StoryPlan | false;
};

export type SeedDataset = {
  environment: SeedEnvironment;
  /** The published, non-secret password every seeded account gets. Never a real credential. */
  password: string;
  tenants: SeedTenantSpec[];
};

/** The modules that are actually BUILT — nothing else is ever granted by a seeder (ADR-038). */
export const BUILT_MODULES = ['patient', 'appointment', 'opd', 'emr', 'pharmacy', 'laboratory', 'billing', 'abdm'];

export type SeedCounts = Record<string, number>;
export type SeedReport = { tenant: string; code: string; counts: SeedCounts };

// ---------------------------------------------------------------------------
// Backdating
// ---------------------------------------------------------------------------

/**
 * Every record is created through the product's own services, and those stamp "now" — a
 * check-in is always today, an invoice is always dated this minute. A demo database with a
 * single day of history cannot exercise a date-range filter, a revenue trend, a collections
 * report or an EOD summary, so after a record is created the engine moves its timestamps
 * back to the day the story says it happened.
 *
 * This is the one place raw SQL is used, deliberately: it is a *fixture* concern, not
 * behaviour. It never changes a status, an amount or a relationship — only when.
 */
async function backdateVisit(
  tenantId: string,
  visitId: string,
  when: Date,
  completed: boolean,
  token: number,
): Promise<void> {
  const date = isoDate(when);
  await runWithTenant(tenantId, (tx) =>
    tx.execute(sql`
      update visits
         set visit_date = ${date}::date,
             token_number = ${token},
             checked_in_at = ${when}::timestamptz,
             created_at = ${when}::timestamptz,
             updated_at = ${when}::timestamptz,
             completed_at = case when ${completed} then ${when}::timestamptz else completed_at end
       where id = ${visitId}`),
  );
}

async function backdateInvoice(tenantId: string, invoiceId: string, when: Date): Promise<void> {
  await runWithTenant(tenantId, async (tx) => {
    await tx.execute(sql`update invoices set created_at = ${when}::timestamptz, updated_at = ${when}::timestamptz where id = ${invoiceId}`);
    await tx.execute(sql`update invoice_line_items set created_at = ${when}::timestamptz where invoice_id = ${invoiceId}`);
    await tx.execute(sql`update payments set created_at = ${when}::timestamptz where invoice_id = ${invoiceId}`);
  });
}

async function backdateEncounter(tenantId: string, encounterId: string, when: Date): Promise<void> {
  await runWithTenant(tenantId, (tx) =>
    tx.execute(sql`
      update encounters
         set created_at = ${when}::timestamptz,
             updated_at = ${when}::timestamptz,
             signed_at = case when signed_at is null then null else ${when}::timestamptz end
       where id = ${encounterId}`),
  );
}

async function backdateAppointment(tenantId: string, appointmentId: string, when: Date): Promise<void> {
  await runWithTenant(tenantId, (tx) =>
    tx.execute(sql`update appointments set created_at = ${when}::timestamptz, updated_at = ${when}::timestamptz where id = ${appointmentId}`),
  );
}

async function backdatePatient(tenantId: string, patientId: string, when: Date): Promise<void> {
  await runWithTenant(tenantId, (tx) =>
    tx.execute(sql`update patients set created_at = ${when}::timestamptz, updated_at = ${when}::timestamptz where id = ${patientId}`),
  );
}

async function backdateVisitTree(
  tenantId: string,
  visitId: string,
  when: Date,
  completed: boolean,
  token: number,
): Promise<void> {
  await backdateVisit(tenantId, visitId, when, completed, token);
  await runWithTenant(tenantId, async (tx) => {
    await tx.execute(sql`update encounters set created_at = ${when}::timestamptz, updated_at = ${when}::timestamptz, signed_at = case when signed_at is null then null else ${when}::timestamptz end where visit_id = ${visitId}`);
    await tx.execute(sql`update lab_orders set created_at = ${when}::timestamptz where visit_id = ${visitId}`);
    await tx.execute(sql`update invoices set created_at = ${when}::timestamptz, updated_at = ${when}::timestamptz where visit_id = ${visitId}`);
    await tx.execute(sql`
      update invoice_line_items set created_at = ${when}::timestamptz
       where invoice_id in (select id from invoices where visit_id = ${visitId})`);
    await tx.execute(sql`
      update payments set created_at = ${when}::timestamptz
       where invoice_id in (select id from invoices where visit_id = ${visitId})`);
    await tx.execute(sql`
      update dispenses set dispensed_at = ${when}::timestamptz
       where prescription_id in (
         select p.id from prescriptions p join encounters e on e.id = p.encounter_id where e.visit_id = ${visitId})`);
  });
}

// ---------------------------------------------------------------------------
// Idempotent building blocks
// ---------------------------------------------------------------------------

export async function upsertTenant(spec: SeedTenantSpec): Promise<string> {
  const existing = (await db.select().from(tenants).where(eq(tenants.code, spec.code)).limit(1))[0];
  if (existing) {
    if (spec.status && existing.status !== spec.status) {
      await db.update(tenants).set({ status: spec.status, updatedAt: new Date() }).where(eq(tenants.id, existing.id));
    }
    await provisionTenantRbac(existing.id);
    return existing.id;
  }
  const created = (
    await db.insert(tenants).values({ code: spec.code, name: spec.name, status: spec.status ?? 'active' }).returning()
  )[0]!;
  await provisionTenantRbac(created.id);
  return created.id;
}

export async function upsertUser(
  tenantId: string,
  u: SeedUser,
  password: string,
): Promise<string> {
  const existing = await runWithTenant(tenantId, (tx) =>
    tx.select({ id: users.id }).from(users).where(eq(users.email, u.email)).limit(1),
  );
  let userId = existing[0]?.id;
  if (!userId) {
    const passwordHash = await hashPassword(password);
    const created = await runWithTenant(tenantId, (tx) =>
      tx
        .insert(users)
        .values({ tenantId, email: u.email, passwordHash, fullName: u.fullName, status: u.status ?? 'active' })
        .returning({ id: users.id }),
    );
    userId = created[0]!.id;
  } else if (u.status) {
    await runWithTenant(tenantId, (tx) =>
      tx.update(users).set({ status: u.status!, updatedAt: new Date() }).where(eq(users.id, userId!)),
    );
  }
  await assignRoleByKey(tenantId, userId, u.role);
  return userId;
}

async function upsertBranch(tenantId: string, b: { code: string; name: string; isActive?: boolean }): Promise<string> {
  return runWithTenant(tenantId, async (tx) => {
    const existing = (
      await tx.select().from(branches).where(and(eq(branches.tenantId, tenantId), eq(branches.code, b.code))).limit(1)
    )[0];
    if (existing) {
      if (b.isActive === false && existing.isActive) {
        await tx.update(branches).set({ isActive: false, updatedAt: new Date() }).where(eq(branches.id, existing.id));
      }
      return existing.id;
    }
    const created = (
      await tx
        .insert(branches)
        .values({ tenantId, code: b.code, name: b.name, isActive: b.isActive ?? true })
        .returning({ id: branches.id })
    )[0]!;
    return created.id;
  });
}

async function upsertDepartment(
  tenantId: string,
  d: { code: string; name: string; specialty?: string; isActive?: boolean },
): Promise<string> {
  const code = d.code.trim().toUpperCase();
  return runWithTenant(tenantId, async (tx) => {
    const existing = (
      await tx
        .select()
        .from(departments)
        .where(and(eq(departments.tenantId, tenantId), eq(departments.code, code)))
        .limit(1)
    )[0];
    if (existing) {
      if (d.isActive === false && existing.isActive) {
        await tx.update(departments).set({ isActive: false, updatedAt: new Date() }).where(eq(departments.id, existing.id));
      }
      return existing.id;
    }
    const created = (
      await tx
        .insert(departments)
        .values({
          tenantId,
          code,
          name: d.name,
          specialtyCode: d.specialty ?? null,
          isActive: d.isActive ?? true,
        })
        .returning({ id: departments.id })
    )[0]!;
    return created.id;
  });
}

// ---------------------------------------------------------------------------
// The per-tenant context the story generator works against
// ---------------------------------------------------------------------------

type Ctx = {
  tenantId: string;
  code: string;
  modules: string[];
  branchIds: string[];
  departmentIds: string[];
  /** Only providers that can actually take a patient — an inactive one cannot be checked into. */
  providerIds: string[];
  patientIds: string[];
  labTestIds: string[];
  drugIds: string[];
  serviceIds: string[];
  users: Map<string, string>;
  counts: SeedCounts;
};

const bump = (c: SeedCounts, key: string, by = 1): void => {
  c[key] = (c[key] ?? 0) + by;
};

/** Actor ids, so every seeded record is attributable to a plausible person, not to nobody. */
function actors(ctx: Ctx, specUsers: SeedUser[]) {
  const byRole = (role: string): string | undefined => {
    const u = specUsers.find((x) => x.role === role && x.status !== 'inactive');
    return u ? ctx.users.get(u.email) : undefined;
  };
  return {
    admin: byRole('org_admin'),
    doctor: byRole('doctor'),
    reception: byRole('receptionist'),
    cashier: byRole('cashier'),
    pharmacist: byRole('pharmacist'),
    lab: byRole('lab_technician'),
  };
}

// ---------------------------------------------------------------------------
// Clinical content
// ---------------------------------------------------------------------------

/**
 * Realistic OPD presentations. Each one is a complete consultation — complaint, SOAP note,
 * ICD-10 diagnosis, prescription and investigations — so a seeded chart reads like something
 * a clinician wrote, not like a fixture. Drugs and tests are named, then resolved against the
 * tenant's own catalogue at seed time; anything the hospital does not stock stays as the
 * free-text the product also allows.
 *
 * Not clinical advice, and not a protocol. It is demo content whose only job is to make the
 * screens, filters and printed documents testable with plausible material.
 */
type Presentation = {
  complaint: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  diagnoses: Array<{ code: string; term: string; primary?: boolean }>;
  drugs: Array<{ name: string; dose: string; frequency: string; duration: string; route?: string; instructions?: string }>;
  tests: string[];
  vitals: { systolic: number; diastolic: number; pulse: number; spo2: number; respRate: number; tempC: number; weightKg: number; heightCm: number };
};

const PRESENTATIONS: readonly Presentation[] = [
  {
    complaint: 'Fever and body ache for 3 days',
    subjective: 'Intermittent fever up to 101 °F for three days, generalised body ache, mild headache. No rash, no bleeding. Appetite reduced.',
    objective: 'Febrile, well hydrated. Throat mildly congested. Chest clear. No organomegaly.',
    assessment: 'Acute febrile illness, likely viral. Dengue screen advised given local outbreak.',
    plan: 'Antipyretics, oral fluids, CBC and dengue screen today. Review in 48 hours or earlier if bleeding, persistent vomiting or drowsiness.',
    diagnoses: [{ code: 'R50.9', term: 'Fever, unspecified', primary: true }],
    drugs: [{ name: 'Paracetamol', dose: '650 mg', frequency: 'TDS', duration: '3 days', route: 'Oral', instructions: 'After food' }],
    tests: ['Complete Blood Count', 'Dengue NS1 Antigen'],
    vitals: { systolic: 118, diastolic: 78, pulse: 96, spo2: 98, respRate: 18, tempC: 38.4, weightKg: 68, heightCm: 170 },
  },
  {
    complaint: 'Cough and cold for 5 days',
    subjective: 'Dry cough worse at night, nasal congestion, mild sore throat. No breathlessness, no fever since yesterday.',
    objective: 'Afebrile. Nasal mucosa congested, throat mildly inflamed. Chest clear bilaterally.',
    assessment: 'Acute upper respiratory tract infection, viral.',
    plan: 'Symptomatic treatment, steam inhalation, adequate fluids. Antibiotic not indicated. Review if fever or breathlessness.',
    diagnoses: [{ code: 'J06.9', term: 'Acute upper respiratory infection, unspecified', primary: true }],
    drugs: [
      { name: 'Cetirizine', dose: '10 mg', frequency: 'HS', duration: '5 days', route: 'Oral' },
      { name: 'Paracetamol', dose: '500 mg', frequency: 'SOS', duration: '3 days', route: 'Oral' },
    ],
    tests: [],
    vitals: { systolic: 122, diastolic: 80, pulse: 84, spo2: 99, respRate: 16, tempC: 36.9, weightKg: 72, heightCm: 174 },
  },
  {
    complaint: 'Follow-up for diabetes',
    subjective: 'On metformin for two years. Reports occasional evening hypoglycaemia symptoms. Diet compliance moderate, no regular exercise.',
    objective: 'Overweight. No pallor or oedema. Peripheral pulses intact, no foot ulcer. Fundus review pending.',
    assessment: 'Type 2 diabetes mellitus, moderately controlled.',
    plan: 'Continue metformin. HbA1c and lipid profile today. Dietician referral discussed. Review with reports in 2 weeks.',
    diagnoses: [
      { code: 'E11.9', term: 'Type 2 diabetes mellitus without complications', primary: true },
      { code: 'E78.5', term: 'Hyperlipidaemia, unspecified' },
    ],
    drugs: [{ name: 'Metformin', dose: '500 mg', frequency: 'BD', duration: '30 days', route: 'Oral', instructions: 'After meals' }],
    tests: ['HbA1c', 'Lipid Profile', 'Fasting Blood Sugar'],
    vitals: { systolic: 134, diastolic: 86, pulse: 78, spo2: 98, respRate: 16, tempC: 36.7, weightKg: 84, heightCm: 168 },
  },
  {
    complaint: 'High blood pressure review',
    subjective: 'Known hypertensive for six years. Occasional early-morning headache. Taking amlodipine regularly, salt intake high.',
    objective: 'BP elevated on two readings. Heart sounds normal, no murmur. No pedal oedema.',
    assessment: 'Essential hypertension, sub-optimally controlled.',
    plan: 'Salt restriction counselled. Continue amlodipine, add home BP diary. Kidney function and lipid profile today. Review in 4 weeks.',
    diagnoses: [{ code: 'I10', term: 'Essential (primary) hypertension', primary: true }],
    drugs: [{ name: 'Amlodipine', dose: '5 mg', frequency: 'OD', duration: '30 days', route: 'Oral', instructions: 'Morning' }],
    tests: ['Kidney Function Test', 'Lipid Profile'],
    vitals: { systolic: 148, diastolic: 94, pulse: 80, spo2: 98, respRate: 16, tempC: 36.6, weightKg: 78, heightCm: 172 },
  },
  {
    complaint: 'Burning in the stomach after meals',
    subjective: 'Epigastric burning for two weeks, worse after spicy food, relieved partially by antacids. No vomiting, no black stools.',
    objective: 'Mild epigastric tenderness. No guarding. Bowel sounds normal.',
    assessment: 'Gastro-oesophageal reflux disease.',
    plan: 'Proton-pump inhibitor for four weeks, dietary advice, avoid late meals. Endoscopy if no relief.',
    diagnoses: [{ code: 'K21.9', term: 'Gastro-oesophageal reflux disease without oesophagitis', primary: true }],
    drugs: [{ name: 'Pantoprazole', dose: '40 mg', frequency: 'OD', duration: '28 days', route: 'Oral', instructions: 'Before breakfast' }],
    tests: [],
    vitals: { systolic: 124, diastolic: 82, pulse: 76, spo2: 99, respRate: 16, tempC: 36.8, weightKg: 70, heightCm: 166 },
  },
  {
    complaint: 'Loose motions since yesterday',
    subjective: 'Six loose stools since yesterday evening, mild abdominal cramps, one episode of vomiting. Ate outside food two days ago.',
    objective: 'Mildly dehydrated, tongue dry. Abdomen soft, diffuse tenderness. No fever at present.',
    assessment: 'Acute infective gastroenteritis with mild dehydration.',
    plan: 'ORS after every loose stool, bland diet, zinc supplementation. Stool routine if symptoms persist beyond 48 hours.',
    diagnoses: [{ code: 'A09', term: 'Infectious gastroenteritis and colitis, unspecified', primary: true }],
    drugs: [
      { name: 'ORS', dose: '1 sachet', frequency: 'After each stool', duration: '3 days', route: 'Oral' },
      { name: 'Pantoprazole', dose: '40 mg', frequency: 'OD', duration: '5 days', route: 'Oral' },
    ],
    tests: ['Complete Blood Count'],
    vitals: { systolic: 108, diastolic: 70, pulse: 98, spo2: 98, respRate: 18, tempC: 37.2, weightKg: 62, heightCm: 164 },
  },
  {
    complaint: 'Tiredness and hair fall',
    subjective: 'Fatigue for two months, hair fall, cold intolerance. Menstrual cycles regular but heavy.',
    objective: 'Pallor present. Thyroid not palpable. No pedal oedema.',
    assessment: 'Anaemia for evaluation; hypothyroidism to be ruled out.',
    plan: 'Haemogram, TSH and iron studies today. Iron supplementation started. Review with reports.',
    diagnoses: [
      { code: 'D50.9', term: 'Iron deficiency anaemia, unspecified', primary: true },
      { code: 'E03.9', term: 'Hypothyroidism, unspecified' },
    ],
    drugs: [{ name: 'Ferrous Ascorbate', dose: '100 mg', frequency: 'OD', duration: '30 days', route: 'Oral', instructions: 'Empty stomach with vitamin C' }],
    tests: ['Hemoglobin', 'Thyroid Stimulating Hormone', 'Complete Blood Count'],
    vitals: { systolic: 106, diastolic: 68, pulse: 88, spo2: 99, respRate: 16, tempC: 36.6, weightKg: 52, heightCm: 158 },
  },
  {
    complaint: 'Wheezing and breathlessness on exertion',
    subjective: 'Known asthmatic. Increased wheeze for four days, night-time cough, using inhaler more often. No fever.',
    objective: 'Mild respiratory distress. Bilateral rhonchi. SpO2 maintained on room air.',
    assessment: 'Bronchial asthma, mild exacerbation.',
    plan: 'Inhaled bronchodilator, montelukast at night, trigger avoidance counselled. Review in one week; earlier if worsening.',
    diagnoses: [{ code: 'J45.909', term: 'Unspecified asthma, uncomplicated', primary: true }],
    drugs: [
      { name: 'Salbutamol', dose: '2 puffs', frequency: 'QID', duration: '7 days', route: 'Inhalation' },
      { name: 'Montelukast', dose: '10 mg', frequency: 'HS', duration: '14 days', route: 'Oral' },
    ],
    tests: [],
    vitals: { systolic: 120, diastolic: 78, pulse: 92, spo2: 96, respRate: 22, tempC: 36.9, weightKg: 66, heightCm: 169 },
  },
  {
    complaint: 'Burning urination for 3 days',
    subjective: 'Burning micturition, increased frequency, mild lower abdominal discomfort. No fever, no flank pain.',
    objective: 'Suprapubic tenderness present. No renal angle tenderness.',
    assessment: 'Lower urinary tract infection.',
    plan: 'Urine routine and culture, empirical antibiotic started, plenty of oral fluids. Review with culture report.',
    diagnoses: [{ code: 'N39.0', term: 'Urinary tract infection, site not specified', primary: true }],
    drugs: [{ name: 'Amoxicillin', dose: '500 mg', frequency: 'TDS', duration: '5 days', route: 'Oral', instructions: 'Complete the course' }],
    tests: ['Urine Routine'],
    vitals: { systolic: 118, diastolic: 76, pulse: 82, spo2: 99, respRate: 16, tempC: 37.1, weightKg: 58, heightCm: 160 },
  },
  {
    complaint: 'Itchy rash on both forearms',
    subjective: 'Itchy red rash for one week after starting a new detergent. Worse at night. No systemic symptoms.',
    objective: 'Erythematous papular rash over both forearms with excoriation marks. No secondary infection.',
    assessment: 'Allergic contact dermatitis.',
    plan: 'Stop the suspected detergent, topical emollient, oral antihistamine at night. Review in 10 days.',
    diagnoses: [{ code: 'L23.9', term: 'Allergic contact dermatitis, unspecified cause', primary: true }],
    drugs: [{ name: 'Cetirizine', dose: '10 mg', frequency: 'HS', duration: '10 days', route: 'Oral' }],
    tests: [],
    vitals: { systolic: 116, diastolic: 74, pulse: 78, spo2: 99, respRate: 16, tempC: 36.7, weightKg: 64, heightCm: 165 },
  },
];

/** Plausible values per test, in both a normal and an out-of-range form. */
const LAB_VALUES: Record<string, { normal: string; abnormal: string }> = {
  hemoglobin: { normal: '13.4', abnormal: '8.9' },
  'complete blood count': { normal: '7800', abnormal: '14200' },
  'fasting blood sugar': { normal: '92', abnormal: '168' },
  hba1c: { normal: '5.4', abnormal: '8.6' },
  'lipid profile': { normal: '168', abnormal: '264' },
  'thyroid stimulating hormone': { normal: '2.4', abnormal: '9.8' },
  'urine routine': { normal: 'No abnormality detected', abnormal: 'Pus cells 15–20/hpf' },
  'liver function test': { normal: '32', abnormal: '96' },
  'kidney function test': { normal: '0.9', abnormal: '2.1' },
  'dengue ns1 antigen': { normal: 'Negative', abnormal: 'Positive' },
  'c-reactive protein': { normal: '3', abnormal: '48' },
};

function labValue(testName: string, abnormal: boolean): string {
  const entry = LAB_VALUES[testName.trim().toLowerCase()];
  if (!entry) return abnormal ? 'Abnormal — see attached report' : 'Within normal limits';
  return abnormal ? entry.abnormal : entry.normal;
}

// ---------------------------------------------------------------------------
// Catalogues (lab tests, services, suppliers, drugs + opening stock)
// ---------------------------------------------------------------------------

/**
 * Seeded only while the tenant's catalogue is empty, so a re-run never duplicates a master
 * record or renumbers anything hanging off it. This is the idempotency rule everywhere in
 * this engine: *create when absent, never overwrite what a tester has since edited.*
 */
async function seedCatalogues(ctx: Ctx, spec: SeedTenantSpec, act: ReturnType<typeof actors>): Promise<void> {
  if (ctx.modules.includes('laboratory') && spec.labTests?.length) {
    const existing = await runWithTenant(ctx.tenantId, (tx) =>
      tx.execute<{ id: string }>(sql`select id from lab_tests where tenant_id = ${ctx.tenantId} limit 1`),
    );
    if (existing.rows.length === 0) {
      for (const t of spec.labTests) await createTest(ctx.tenantId, t, act.admin);
      bump(ctx.counts, 'labTests', spec.labTests.length);
    }
    const rows = await runWithTenant(ctx.tenantId, (tx) =>
      tx.execute<{ id: string }>(sql`select id from lab_tests where tenant_id = ${ctx.tenantId} order by created_at`),
    );
    ctx.labTestIds = rows.rows.map((r) => r.id);
  }

  if (ctx.modules.includes('billing') && spec.services?.length) {
    const existing = await runWithTenant(ctx.tenantId, (tx) =>
      tx.select({ id: servicesTable.id }).from(servicesTable).where(eq(servicesTable.tenantId, ctx.tenantId)).limit(1),
    );
    if (existing.length === 0) {
      for (const s of spec.services) {
        const { isActive, ...input } = s;
        const created = await createService(ctx.tenantId, input, act.admin);
        // A retired service still has to appear behind the "inactive" filter — and behind the
        // historical invoices that already reference it.
        if (isActive === false && created) {
          await runWithTenant(ctx.tenantId, (tx) =>
            tx.update(servicesTable).set({ isActive: false, updatedAt: new Date() }).where(eq(servicesTable.id, created.id)),
          );
        }
      }
      bump(ctx.counts, 'services', spec.services.length);
    }
    const rows = await runWithTenant(ctx.tenantId, (tx) =>
      tx
        .select({ id: servicesTable.id })
        .from(servicesTable)
        .where(and(eq(servicesTable.tenantId, ctx.tenantId), eq(servicesTable.isActive, true)))
        .orderBy(asc(servicesTable.code)),
    );
    ctx.serviceIds = rows.map((r) => r.id);
  }

  if (!ctx.modules.includes('pharmacy')) return;

  const supplierIds = new Map<string, string>();
  if (spec.suppliers?.length) {
    const existing = await runWithTenant(ctx.tenantId, (tx) =>
      tx.execute<{ id: string; name: string }>(sql`select id, name from suppliers where tenant_id = ${ctx.tenantId}`),
    );
    if (existing.rows.length === 0) {
      for (const s of spec.suppliers) {
        const created = await createSupplier(ctx.tenantId, s, act.pharmacist ?? act.admin);
        supplierIds.set(created.name, created.id);
      }
      bump(ctx.counts, 'suppliers', spec.suppliers.length);
    } else {
      for (const row of existing.rows) supplierIds.set(row.name, row.id);
    }
  }

  if (spec.drugs?.length) {
    const existing = await runWithTenant(ctx.tenantId, (tx) =>
      tx.execute<{ id: string }>(sql`select id from drugs where tenant_id = ${ctx.tenantId} limit 1`),
    );
    if (existing.rows.length === 0) {
      for (const d of spec.drugs) {
        const { batches, ...input } = d;
        const created = await createDrug(ctx.tenantId, input, act.pharmacist ?? act.admin);
        if (!created) continue;
        for (const b of batches) {
          await receiveStock(
            ctx.tenantId,
            created.id,
            {
              batchNo: b.batchNo,
              expiryDate: b.expiryDate,
              quantity: b.quantity,
              costPricePaise: b.costPricePaise ?? null,
              supplierId: b.supplier ? (supplierIds.get(b.supplier) ?? null) : null,
            },
            act.pharmacist ?? act.admin,
          );
        }
      }
      bump(ctx.counts, 'drugs', spec.drugs.length);
    }
  }

  const drugRows = await runWithTenant(ctx.tenantId, (tx) =>
    tx.execute<{ id: string; name: string }>(sql`select id, name from drugs where tenant_id = ${ctx.tenantId} order by name`),
  );
  ctx.drugIds = drugRows.rows.map((r) => r.id);
}

/** Drug id by (loose) name, so a presentation's prescription links the real master row. */
async function drugByName(tenantId: string, name: string): Promise<{ id: string; name: string } | null> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx.execute<{ id: string; name: string }>(
      sql`select id, name from drugs where tenant_id = ${tenantId} and name ilike ${`${name}%`} and is_active order by name limit 1`,
    ),
  );
  return rows.rows[0] ?? null;
}

/** Test id by (loose) name — same idea, so an order is priced and range-checked properly. */
async function testByName(tenantId: string, name: string): Promise<{ id: string; name: string; code: string | null } | null> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx.execute<{ id: string; name: string; code: string | null }>(
      sql`select id, name, code from lab_tests where tenant_id = ${tenantId} and name ilike ${`${name}%`} and is_active order by name limit 1`,
    ),
  );
  return rows.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// One patient journey
// ---------------------------------------------------------------------------

type Act = ReturnType<typeof actors>;

/** Where a consultation is left — this is what puts a row in each column of the OPD queue. */
type ConsultStage =
  | 'none' // checked in, nothing opened yet: waiting for vitals
  | 'vitals' // draft encounter with vitals only: waiting for the doctor
  | 'in_progress' // visit moved to in_consultation, note half written
  | 'signed'; // consultation completed and locked

type LabStage = 'none' | 'ordered' | 'collected' | 'resulted' | 'verified' | 'cancelled';

async function payInvoice(
  ctx: Ctx,
  invoiceId: string,
  amountPaise: number,
  method: string,
  actorUserId: string | undefined,
  key: string,
): Promise<void> {
  if (amountPaise <= 0) return;
  await recordPayment(
    ctx.tenantId,
    invoiceId,
    {
      amountPaise,
      method,
      reference: method === 'cash' ? null : `${method.toUpperCase()}-${key}`,
      // Keyed on the invoice, not on the loop position. A seeder that died half way and is run
      // again produces new invoices; a positional key would collide with the dead run's key and
      // the payment would be silently deduped away, leaving an unpayable visit behind.
      idempotencyKey: `seed:${invoiceId}:${key}`,
    },
    actorUserId,
  );
  bump(ctx.counts, 'payments');
}

/**
 * Settle whatever a visit still owes.
 *
 * The consultation fee is collected at check-in, but the lab charges and the pharmacy bill land
 * on the same invoice afterwards — so a visit that was paid in full at the desk is *partially
 * paid* by the time the patient leaves. That is exactly how it works in the building, and it is
 * why the second collection exists: without it every completed visit in the dataset would sit
 * in one status and the Billing filter would have nothing to separate.
 */
async function settleVisitBalance(
  ctx: Ctx,
  visitId: string,
  method: string,
  actorUserId: string | undefined,
  key: string,
): Promise<void> {
  const rows = await runWithTenant(ctx.tenantId, (tx) =>
    tx.execute<{ id: string; balance: number }>(
      sql`select i.id, (i.total_paise - i.amount_paid_paise)::int as balance
            from invoices i
           where i.tenant_id = ${ctx.tenantId} and i.visit_id = ${visitId} and i.status <> 'void'`,
    ),
  );
  for (const row of rows.rows) {
    if (Number(row.balance) > 0) await payInvoice(ctx, row.id, Number(row.balance), method, actorUserId, key);
  }
}

/**
 * Write a consultation onto an open visit and leave it at the requested stage.
 *
 * The visit's own state machine does the rest: signing an encounter is what completes the
 * visit and fulfils its appointment, exactly as it does when a doctor clicks Sign. Nothing
 * here shortcuts that.
 */
async function runConsultation(
  ctx: Ctx,
  act: Act,
  visitId: string,
  opts: {
    presentation: Presentation;
    stage: ConsultStage;
    labStage: LabStage;
    abnormalLab?: boolean;
    /** Flags the result critical outright — the one lab state a reference range cannot derive. */
    criticalLab?: boolean;
    dispense?: boolean;
  },
): Promise<void> {
  if (opts.stage === 'none') return;
  const p = opts.presentation;

  if (opts.stage === 'in_progress') {
    await updateStatus(ctx.tenantId, visitId, 'in_consultation', undefined, act.doctor ?? act.reception);
  }

  const enc = await getEncounterByVisit(ctx.tenantId, visitId, act.doctor);
  bump(ctx.counts, 'encounters');

  // Vitals are the nurse's half of the note and land before the doctor writes anything —
  // which is why "vitals recorded, waiting for consultation" is its own queue state.
  const vitalsOnly: SaveEncounterInput = {
    version: enc.version,
    chiefComplaint: p.complaint,
    vitals: p.vitals,
    diagnoses: [],
    prescriptions: [],
    labOrders: [],
  };
  if (opts.stage === 'vitals') {
    await saveEncounter(ctx.tenantId, enc.id, vitalsOnly, act.doctor);
    return;
  }

  const prescriptions: SaveEncounterInput['prescriptions'] = [];
  for (const d of p.drugs) {
    const master = ctx.modules.includes('pharmacy') ? await drugByName(ctx.tenantId, d.name) : null;
    prescriptions.push({
      drugId: master?.id ?? null,
      drugName: master?.name ?? d.name,
      dose: d.dose,
      frequency: d.frequency,
      duration: d.duration,
      route: d.route ?? 'Oral',
      instructions: d.instructions ?? null,
    });
  }

  const labOrders: SaveEncounterInput['labOrders'] = [];
  if (ctx.modules.includes('laboratory') && opts.labStage !== 'none') {
    for (const t of p.tests) {
      const master = await testByName(ctx.tenantId, t);
      labOrders.push({
        testId: master?.id ?? null,
        testName: master?.name ?? t,
        testCode: master?.code ?? null,
        priority: p.tests.indexOf(t) === 0 ? 'routine' : 'urgent',
        notes: null,
      });
    }
  }

  const full: SaveEncounterInput = {
    version: enc.version,
    chiefComplaint: p.complaint,
    subjective: p.subjective,
    objective: p.objective,
    assessment: opts.stage === 'in_progress' ? null : p.assessment,
    plan: opts.stage === 'in_progress' ? null : p.plan,
    vitals: p.vitals,
    diagnoses: p.diagnoses.map((d) => ({ icd10Code: d.code, icd10Term: d.term, isPrimary: d.primary ?? false })),
    prescriptions: opts.stage === 'in_progress' ? [] : prescriptions,
    labOrders: opts.stage === 'in_progress' ? [] : labOrders,
  };
  await saveEncounter(ctx.tenantId, enc.id, full, act.doctor);
  if (opts.stage === 'in_progress') return;

  await signEncounter(ctx.tenantId, enc.id, act.doctor);
  bump(ctx.counts, 'signedEncounters');
  bump(ctx.counts, 'prescriptions', prescriptions.length);

  // ---- laboratory: walk the order as far as the scenario asks ----
  if (labOrders.length > 0 && opts.labStage !== 'none' && opts.labStage !== 'ordered') {
    const orders = await runWithTenant(ctx.tenantId, (tx) =>
      tx.execute<{ id: string; test_name: string }>(
        sql`select id, test_name from lab_orders where tenant_id = ${ctx.tenantId} and visit_id = ${visitId} order by created_at`,
      ),
    );
    for (const o of orders.rows) {
      if (opts.labStage === 'cancelled') {
        // No product action cancels a lab order yet (BACKLOG). Set directly so the
        // worklist's "cancelled" filter has data to find.
        await runWithTenant(ctx.tenantId, (tx) =>
          tx.update(labOrdersTable).set({ status: 'cancelled' }).where(eq(labOrdersTable.id, o.id)),
        );
        bump(ctx.counts, 'labOrdersCancelled');
        continue;
      }
      await collectSample(ctx.tenantId, o.id, act.lab);
      if (opts.labStage === 'collected') continue;
      const abnormal = (opts.abnormalLab ?? false) || (opts.criticalLab ?? false);
      await enterResult(
        ctx.tenantId,
        o.id,
        {
          value: labValue(o.test_name, abnormal),
          flag: opts.criticalLab ? 'critical' : undefined,
          notes: opts.criticalLab
            ? 'Critical value — treating doctor informed by telephone.'
            : abnormal
              ? 'Repeat advised; correlate clinically.'
              : null,
        },
        act.lab,
      );
      bump(ctx.counts, 'labResults');
      if (opts.criticalLab) {
        // `critical` is the one flag the service cannot derive: it computes low/high/normal from
        // the reference range, and an explicit flag only survives for a qualitative result. The
        // product has no "mark critical" action yet (BACKLOG), so the row is set here.
        await runWithTenant(ctx.tenantId, (tx) =>
          tx.execute(sql`update lab_results set flag = 'critical' where tenant_id = ${ctx.tenantId} and lab_order_id = ${o.id}`),
        );
        bump(ctx.counts, 'labCritical');
      }
      if (opts.labStage === 'verified') {
        await verifyResult(ctx.tenantId, o.id, act.lab);
        bump(ctx.counts, 'labVerified');
      }
    }
  }

  // ---- pharmacy: dispense what the doctor prescribed ----
  if (opts.dispense && ctx.modules.includes('pharmacy')) {
    const rx = await runWithTenant(ctx.tenantId, (tx) =>
      tx.execute<{ id: string; drug_id: string | null }>(
        sql`select p.id, p.drug_id
              from prescriptions p
              join encounters e on e.id = p.encounter_id
             where p.tenant_id = ${ctx.tenantId} and e.visit_id = ${visitId} and p.status = 'ordered'
             order by p.created_at`,
      ),
    );
    for (const line of rx.rows) {
      if (!line.drug_id) continue;
      // Never dispense a drug to zero: the low-stock items are low *on purpose* (the dashboard
      // tile and the reorder report need them), and a seeder that empties them destroys the very
      // state it was asked to create. Dispensing what is genuinely there is also the honest
      // behaviour — the service would refuse anything else.
      const onHand = await runWithTenant(ctx.tenantId, (tx) =>
        tx.execute<{ qty: string }>(
          sql`select coalesce(sum(quantity), 0)::int as qty from drug_batches where tenant_id = ${ctx.tenantId} and drug_id = ${line.drug_id}`,
        ),
      );
      const available = Number(onHand.rows[0]?.qty ?? 0);
      const quantity = Math.min(10, available - 5);
      if (quantity < 1) continue;
      await dispense(ctx.tenantId, { prescriptionId: line.id, drugId: line.drug_id, quantity }, act.pharmacist);
      bump(ctx.counts, 'dispenses');
    }
  }
}

// ---------------------------------------------------------------------------
// The clinical story
// ---------------------------------------------------------------------------

const PAYMENT_METHODS = ['cash', 'upi', 'card', 'netbanking'] as const;

/** Today's OPD queue, written so that every column of the workflow has a row in it. */
type TodayScenario = {
  stage: ConsultStage;
  pay: 'none' | 'partial' | 'full';
  lab: LabStage;
  dispense?: boolean;
  abnormal?: boolean;
  critical?: boolean;
  cancel?: boolean;
  walkIn?: boolean;
  /** Collect the balance the consultation added, so the visit ends genuinely settled. */
  settle?: boolean;
};

const TODAY_QUEUE: readonly TodayScenario[] = [
  // Unpaid consultation fee: the visit cannot proceed, which is the rule, and the state a
  // cashier's screen is meant to show.
  { stage: 'none', pay: 'none', lab: 'none' },
  { stage: 'none', pay: 'full', lab: 'none' }, // paid, waiting for vitals
  { stage: 'vitals', pay: 'full', lab: 'none' }, // vitals done, waiting for the doctor
  { stage: 'in_progress', pay: 'full', lab: 'none' }, // consultation in progress
  { stage: 'signed', pay: 'full', lab: 'ordered' }, // done; sample and prescription both pending
  { stage: 'signed', pay: 'full', lab: 'collected' }, // sample taken, result pending
  { stage: 'signed', pay: 'full', lab: 'resulted', critical: true }, // critical result, awaiting verification
  { stage: 'signed', pay: 'full', lab: 'verified', dispense: true, settle: true }, // the finished journey
  { stage: 'none', pay: 'partial', lab: 'none', walkIn: true }, // walk-in, part payment taken
  { stage: 'none', pay: 'none', lab: 'none', cancel: true }, // cancelled at the desk
];

async function seedClinicalStory(ctx: Ctx, spec: SeedTenantSpec, plan: StoryPlan, act: Act): Promise<void> {
  if (ctx.providerIds.length === 0 || ctx.patientIds.length === 0) return;

  /**
   * The story runs **once**, on a hospital with no clinical history.
   *
   * Configuration, people and catalogues can be topped up safely — creating what is missing and
   * leaving the rest alone. A clinical history cannot: replaying it would double every day's
   * traffic, and the second pass would collide with its own live queue (a patient can only be in
   * the OPD once at a time). So a re-run keeps the history that is already there, and
   * regenerating it is what `--reset` is for. That is the honest reading of "idempotent": the
   * script can be run again safely, not that it invents a second past.
   */
  const already = await runWithTenant(ctx.tenantId, (tx) =>
    tx.select({ id: visits.id }).from(visits).where(eq(visits.tenantId, ctx.tenantId)).limit(1),
  );
  if (already.length > 0) {
    bump(ctx.counts, 'storySkippedAlreadySeeded');
    return;
  }

  const r = rng(seedFrom(ctx.code));

  const branchA = ctx.branchIds[0] ?? null;
  const branchB = ctx.branchIds[1] ?? branchA;
  const depts = ctx.departmentIds;

  // The last two charts are left deliberately untouched: "a patient with no history yet" is a
  // state every detail page has to render, and it is the one thing a busy dataset destroys.
  const pool = ctx.patientIds.slice(0, Math.max(1, ctx.patientIds.length - 2));
  let cursor = 0;
  const nextPatient = (): string => pool[cursor++ % pool.length]!;

  // ---- History: completed traffic behind today ---------------------------
  // This is what gives the dashboard a trend, the collections report a range to sum, and a
  // patient's chart a past to open.
  for (let d = plan.historyDays; d >= 1; d--) {
    for (let i = 0; i < plan.visitsPerDay; i++) {
      const when = dayOffset(-d, 9 + i, i % 2 === 0 ? 0 : 30);
      const patientId = nextPatient();
      const providerId = ctx.providerIds[(d + i) % ctx.providerIds.length]!;
      const departmentId = depts.length ? depts[(d + i) % depts.length]! : null;
      const branchId = (d + i) % 2 === 0 ? branchA : branchB;
      const presentation = PRESENTATIONS[(d * plan.visitsPerDay + i) % PRESENTATIONS.length]!;

      let appointmentId: string | null = null;
      // Roughly one in four is a walk-in — a hospital's day is not all booked.
      if ((d + i) % 4 !== 0) {
        const appt = await bookAppointment(
          ctx.tenantId,
          { patientId, providerId, scheduledAt: when.toISOString(), durationMinutes: 15, reason: presentation.complaint, branchId },
          act.reception,
        );
        appointmentId = appt.id;
        bump(ctx.counts, 'appointments');
        await backdateAppointment(ctx.tenantId, appt.id, dayOffset(-d - 2, 12));
      }

      const visit = await checkIn(
        ctx.tenantId,
        { patientId, appointmentId, providerId, branchId, departmentId, reason: presentation.complaint },
        act.reception,
      );
      bump(ctx.counts, 'visits');
      if (visit.invoice) {
        bump(ctx.counts, 'invoices');
        await payInvoice(ctx, visit.invoice.id, visit.invoice.totalPaise, PAYMENT_METHODS[(d + i) % 4]!, act.cashier, `h${d}-${i}`);
      }

      // Rotate the whole lab lifecycle through the history, so the worklist's every status
      // filter — waiting for a sample, resulted, signed off, cancelled — finds records.
      // Weighted, not evenly spread: most orders are seen through to a signed-off result, a few
      // are still moving, and a cancelled order is the exception it is in a real lab.
      const LAB_ROTATION: LabStage[] = [
        'verified', 'resulted', 'none', 'verified',
        'collected', 'none', 'verified', 'ordered',
        'none', 'verified', 'cancelled', 'none',
      ];
      const labStage = LAB_ROTATION[(d + i) % LAB_ROTATION.length]!;
      await runConsultation(ctx, act, visit.id, {
        presentation,
        stage: 'signed',
        labStage,
        abnormalLab: (d + i) % 5 === 0,
        criticalLab: (d + i) % 11 === 0,
        dispense: (d + i) % 2 === 0,
      });
      // Most patients settle before they leave; the rest walk out owing the balance, which is
      // what puts rows on both sides of the Billing status filter.
      if ((d + i) % 3 !== 0) {
        await settleVisitBalance(ctx, visit.id, PAYMENT_METHODS[(d + i + 2) % 4]!, act.cashier, `h${d}-${i}-settle`);
      }
      await backdateVisitTree(ctx.tenantId, visit.id, when, true, i + 1);
    }
  }

  // ---- Today: the live queue --------------------------------------------
  // Every row here is a *live* visit, and a patient can only be in the OPD once at a time, so
  // the queue is capped at the number of charts available. A small clinic gets a shorter queue
  // rather than a failed seed.
  const queue = TODAY_QUEUE.slice(0, Math.min(TODAY_QUEUE.length, pool.length));
  const todayVisitIds: string[] = [];
  for (let i = 0; i < queue.length; i++) {
    const s = queue[i]!;
    const patientId = nextPatient();
    const providerId = ctx.providerIds[i % ctx.providerIds.length]!;
    const departmentId = depts.length ? depts[i % depts.length]! : null;
    const branchId = i % 2 === 0 ? branchA : branchB;
    const presentation = PRESENTATIONS[i % PRESENTATIONS.length]!;
    // Inside a rostered doctor's morning window, and never two starts on the same minute.
    const at = dayOffset(0, 9 + Math.floor(i / 3), (i % 3) * 20);

    let appointmentId: string | null = null;
    if (!s.walkIn) {
      const appt = await bookAppointment(
        ctx.tenantId,
        { patientId, providerId, scheduledAt: at.toISOString(), durationMinutes: 15, reason: presentation.complaint, branchId },
        act.reception,
      );
      appointmentId = appt.id;
      bump(ctx.counts, 'appointments');
    }

    const visit = await checkIn(
      ctx.tenantId,
      { patientId, appointmentId, providerId, branchId, departmentId, reason: presentation.complaint },
      act.reception,
    );
    bump(ctx.counts, 'visits');
    todayVisitIds.push(visit.id);

    if (visit.invoice) {
      bump(ctx.counts, 'invoices');
      const total = visit.invoice.totalPaise;
      if (s.pay === 'full') await payInvoice(ctx, visit.invoice.id, total, PAYMENT_METHODS[i % 4]!, act.cashier, `t${i}`);
      if (s.pay === 'partial') await payInvoice(ctx, visit.invoice.id, Math.max(1, Math.round(total / 3)), 'upi', act.cashier, `t${i}p`);
    }

    if (s.cancel) {
      await updateStatus(ctx.tenantId, visit.id, 'cancelled', undefined, act.reception);
      bump(ctx.counts, 'visitsCancelled');
      continue;
    }

    await runConsultation(ctx, act, visit.id, {
      presentation,
      stage: s.stage,
      labStage: s.lab,
      abnormalLab: s.abnormal,
      criticalLab: s.critical,
      dispense: s.dispense,
    });
    if (s.settle) await settleVisitBalance(ctx, visit.id, 'upi', act.cashier, `t${i}-settle`);
  }

  // ---- Appointments that never became a visit ---------------------------
  // A cancellation and a no-show are ordinary parts of a clinic's day, and both are
  // filter values on the Appointments table, so both need rows behind them.
  for (let k = 1; k <= 3; k++) {
    const appt = await bookAppointment(
      ctx.tenantId,
      {
        patientId: nextPatient(),
        providerId: ctx.providerIds[k % ctx.providerIds.length]!,
        scheduledAt: dayOffset(-k * 2, 11, 30).toISOString(),
        reason: 'Routine consultation',
        branchId: branchA,
      },
      act.reception,
    );
    await cancelAppointmentSafely(ctx, appt.id, 'Patient rescheduled by phone', act.reception);
    bump(ctx.counts, 'appointments');
    bump(ctx.counts, 'appointmentsCancelled');
  }
  for (let k = 1; k <= 3; k++) {
    const appt = await bookAppointment(
      ctx.tenantId,
      {
        patientId: nextPatient(),
        providerId: ctx.providerIds[(k + 1) % ctx.providerIds.length]!,
        scheduledAt: dayOffset(-k * 3, 12, 0).toISOString(),
        reason: 'Follow-up consultation',
        branchId: branchB,
      },
      act.reception,
    );
    // No product action marks a no-show yet (BACKLOG): the status is a filter value the
    // Appointments table already offers, so the row is written directly.
    await runWithTenant(ctx.tenantId, (tx) =>
      tx.update(appointments).set({ status: 'no_show', updatedAt: new Date() }).where(eq(appointments.id, appt.id)),
    );
    bump(ctx.counts, 'appointments');
    bump(ctx.counts, 'appointmentsNoShow');
  }

  // ---- Future appointments ----------------------------------------------
  for (let k = 0; k < plan.futureAppointments; k++) {
    const day = 1 + (k % plan.futureDays);
    const hour = 9 + (k % 4);
    await bookAppointment(
      ctx.tenantId,
      {
        patientId: nextPatient(),
        providerId: ctx.providerIds[k % ctx.providerIds.length]!,
        scheduledAt: dayOffset(day, hour, k % 2 === 0 ? 0 : 30).toISOString(),
        durationMinutes: 15,
        reason: pick(r, ['Follow-up consultation', 'New consultation', 'Report review', 'Vaccination', 'Health check-up']),
        branchId: k % 2 === 0 ? branchA : branchB,
      },
      act.reception,
    );
    bump(ctx.counts, 'appointments');
    bump(ctx.counts, 'appointmentsFuture');
  }

  // ---- Referrals ---------------------------------------------------------
  // Referred from a real visit, to a real department — the point of the screen is that the
  // receiving desk can open the same record, so a referral with no visit behind it is useless.
  if (depts.length > 1) {
    const completedToday = todayVisitIds.slice(4, 8);
    for (let k = 0; k < completedToday.length; k++) {
      const visitId = completedToday[k]!;
      const referral = await createReferral(
        ctx.tenantId,
        {
          visitId,
          toDepartmentId: depts[(k + 1) % depts.length]!,
          toProviderId: ctx.providerIds[(k + 1) % ctx.providerIds.length]!,
          reason: pick(r, [
            'Cardiology opinion for chest discomfort',
            'Orthopaedic review for persistent knee pain',
            'Dermatology opinion for recurrent rash',
            'Paediatric review for poor weight gain',
          ]),
        },
        act.doctor,
      );
      bump(ctx.counts, 'referrals');
      if (k === 0) {
        // Consumed: checking in against a referral is what completes it and links the visit.
        const followUp = await checkIn(ctx.tenantId, { referralId: referral.id, patientId: referral.patientId, branchId: branchA }, act.reception);
        bump(ctx.counts, 'visits');
        bump(ctx.counts, 'referralsCompleted');
        if (followUp.invoice) bump(ctx.counts, 'invoices');
      } else if (k === 1) {
        await cancelReferral(ctx.tenantId, referral.id, act.doctor);
        bump(ctx.counts, 'referralsCancelled');
      }
    }
  }

  // ---- Billing states a clinical visit does not produce -------------------
  await seedBillingEdgeCases(ctx, act, r);

  // ---- Pharmacy stock corrections ---------------------------------------
  if (ctx.modules.includes('pharmacy') && ctx.drugIds.length >= 3) {
    const reasons = [
      { delta: -4, reason: 'Damaged in transit — written off after physical check' },
      { delta: -2, reason: 'Expired strip removed from shelf' },
      { delta: 6, reason: 'Recount after monthly audit — found in reserve stock' },
      { delta: -1, reason: 'Broken vial during handling' },
      { delta: 3, reason: 'Return from ward, re-added to stock' },
    ];
    for (let k = 0; k < reasons.length; k++) {
      const drugId = ctx.drugIds[k % ctx.drugIds.length]!;
      try {
        await adjustStock(ctx.tenantId, drugId, reasons[k]!, act.pharmacist);
        bump(ctx.counts, 'stockAdjustments');
      } catch {
        // A negative adjustment can outrun a batch that a dispense has already drawn down.
        // The adjustment is illustrative; refusing it is correct and not worth failing a seed.
      }
    }
  }
}

/** Cancelling is ordinary, but a double-cancel is a conflict — keep the seed idempotent. */
async function cancelAppointmentSafely(ctx: Ctx, appointmentId: string, reason: string, actorUserId?: string): Promise<void> {
  try {
    await cancelAppointment(ctx.tenantId, appointmentId, reason, actorUserId);
  } catch {
    /* already cancelled on a re-run */
  }
}

/**
 * Invoices that no consultation produces: a standalone procedure bill left in draft, one part
 * paid, one settled, one voided, and one whose payment was later refunded. Every one of these
 * is a value on the Billing table's status filter, so each needs a row behind it.
 *
 * `void` and `refunded` have no product action yet (BACKLOG) — they are written directly here
 * and are the only two billing states in the dataset that a user could not have produced.
 */
async function seedBillingEdgeCases(ctx: Ctx, act: Act, r: () => number): Promise<void> {
  if (!ctx.modules.includes('billing')) return;
  const catalogue = await runWithTenant(ctx.tenantId, (tx) =>
    tx
      .select({ id: servicesTable.id, name: servicesTable.name, price: servicesTable.pricePaise, tax: servicesTable.taxRateBps })
      .from(servicesTable)
      .where(and(eq(servicesTable.tenantId, ctx.tenantId), eq(servicesTable.isActive, true)))
      .orderBy(asc(servicesTable.code)),
  );
  if (catalogue.length === 0 || ctx.patientIds.length === 0) return;

  const outcomes = ['draft', 'partially_paid', 'paid', 'void', 'refunded'] as const;
  for (let k = 0; k < outcomes.length; k++) {
    const outcome = outcomes[k]!;
    const patientId = ctx.patientIds[k % ctx.patientIds.length]!;
    const when = dayOffset(-(3 + k * 4), 15, 0);
    const items = catalogue.slice(k % 2, (k % 2) + 1 + (k % 3)).map((s) => ({
      itemType: 'procedure',
      description: s.name,
      quantity: 1 + (k % 2),
      unitPricePaise: s.price,
      taxRateBps: s.tax,
    }));
    if (items.length === 0) continue;

    const invoice = await createInvoice(
      ctx.tenantId,
      { patientId, branchId: ctx.branchIds[k % Math.max(1, ctx.branchIds.length)] ?? null, notes: pick(r, ['Day-care procedure', 'Dressing and injection', 'Health check-up package', 'Physiotherapy session']), lineItems: items },
      act.cashier ?? act.admin,
    );
    bump(ctx.counts, 'invoices');

    if (outcome === 'partially_paid') {
      await payInvoice(ctx, invoice.id, Math.max(1, Math.round(invoice.totalPaise / 2)), 'upi', act.cashier, `edge${k}`);
    }
    if (outcome === 'paid' || outcome === 'refunded') {
      await payInvoice(ctx, invoice.id, invoice.totalPaise, k % 2 === 0 ? 'card' : 'cash', act.cashier, `edge${k}`);
    }
    if (outcome === 'void') {
      await runWithTenant(ctx.tenantId, (tx) =>
        tx.update(invoices).set({ status: 'void', notes: 'Cancelled before the procedure was performed', updatedAt: new Date() }).where(eq(invoices.id, invoice.id)),
      );
      bump(ctx.counts, 'invoicesVoid');
    }
    if (outcome === 'refunded') {
      await runWithTenant(ctx.tenantId, (tx) =>
        tx.update(payments).set({ status: 'refunded' }).where(eq(payments.invoiceId, invoice.id)),
      );
      bump(ctx.counts, 'paymentsRefunded');
    }
    await backdateInvoice(ctx.tenantId, invoice.id, when);
  }
}

// ---------------------------------------------------------------------------
// Public submissions, notifications, audit history, permission overrides
// ---------------------------------------------------------------------------

/**
 * Inbound public submissions (the QR registration form and the online booking form) in all
 * three review states, so the Patient registrations and Appointment requests screens open with
 * something to approve, something to reject and a decision history to read.
 *
 * The rows are written directly rather than through `submitRegistrationRequest`, because that
 * path deliberately requires the tenant's public token and an HTTP request. Approving one is a
 * staff action with its own screen — that stays a manual test, which is the point of seeding a
 * pending queue.
 */
async function seedPublicRequests(ctx: Ctx, spec: SeedTenantSpec, act: Act): Promise<void> {
  if (spec.registrationRequests?.length) {
    const existing = await runWithTenant(ctx.tenantId, (tx) =>
      tx.select({ id: registrationRequests.id }).from(registrationRequests).where(eq(registrationRequests.tenantId, ctx.tenantId)).limit(1),
    );
    if (existing.length === 0) {
      for (let i = 0; i < spec.registrationRequests.length; i++) {
        const q = spec.registrationRequests[i]!;
        const reviewed = q.decision !== 'pending';
        await runWithTenant(ctx.tenantId, (tx) =>
          tx.insert(registrationRequests).values({
            tenantId: ctx.tenantId,
            firstName: q.firstName,
            lastName: q.lastName ?? null,
            gender: q.gender ?? null,
            dateOfBirth: q.dateOfBirth ?? null,
            phone: q.phone,
            email: q.email ?? null,
            city: q.city ?? null,
            note: q.note ?? null,
            status: q.decision,
            patientId: q.decision === 'approved' ? (ctx.patientIds[i % Math.max(1, ctx.patientIds.length)] ?? null) : null,
            reviewedBy: reviewed ? (act.reception ?? null) : null,
            reviewedAt: reviewed ? dayOffset(-(1 + i)) : null,
            rejectionReason: q.decision === 'rejected' ? (q.rejectionReason ?? 'Could not be reached on the number provided') : null,
            createdAt: dayOffset(-(2 + i), 18, 20),
          }),
        );
        bump(ctx.counts, `registrationRequests.${q.decision}`);
      }
    }
  }

  if (spec.bookingRequests?.length) {
    const existing = await runWithTenant(ctx.tenantId, (tx) =>
      tx.select({ id: appointmentRequests.id }).from(appointmentRequests).where(eq(appointmentRequests.tenantId, ctx.tenantId)).limit(1),
    );
    if (existing.length === 0) {
      for (let i = 0; i < spec.bookingRequests.length; i++) {
        const q = spec.bookingRequests[i]!;
        const reviewed = q.decision !== 'pending';
        await runWithTenant(ctx.tenantId, (tx) =>
          tx.insert(appointmentRequests).values({
            tenantId: ctx.tenantId,
            firstName: q.firstName,
            lastName: q.lastName ?? null,
            phone: q.phone,
            email: q.email ?? null,
            preferredDate: q.preferredDate ?? isoDate(dayOffset(2 + i)),
            preferredTime: q.preferredTime ?? '10:30',
            departmentId: ctx.departmentIds[i % Math.max(1, ctx.departmentIds.length)] ?? null,
            providerId: ctx.providerIds[i % Math.max(1, ctx.providerIds.length)] ?? null,
            note: q.note ?? null,
            status: q.decision,
            patientId: q.decision === 'approved' ? (ctx.patientIds[i % Math.max(1, ctx.patientIds.length)] ?? null) : null,
            reviewedBy: reviewed ? (act.reception ?? null) : null,
            reviewedAt: reviewed ? dayOffset(-(1 + i)) : null,
            rejectionReason: q.decision === 'rejected' ? (q.rejectionReason ?? 'No slot available on the requested day') : null,
            createdAt: dayOffset(-(1 + i), 20, 5),
          }),
        );
        bump(ctx.counts, `bookingRequests.${q.decision}`);
      }
    }
  }
}

/**
 * The communication log. Written directly and never sent: a seeder that called the provider
 * would put real messages on real phones (ADR-059 keeps every send server-side and
 * configuration-driven). Statuses cover sent, queued and failed so the log's own states are
 * visible.
 */
async function seedNotificationLog(ctx: Ctx): Promise<void> {
  const existing = await runWithTenant(ctx.tenantId, (tx) =>
    tx.select({ id: notificationLog.id }).from(notificationLog).where(eq(notificationLog.tenantId, ctx.tenantId)).limit(1),
  );
  if (existing.length > 0) return;

  const rows = [
    { channel: 'email', templateKey: 'appointment_confirmed', subject: 'Your appointment is confirmed', status: 'sent', provider: 'msg91' },
    { channel: 'email', templateKey: 'payment_receipt', subject: 'Receipt for your payment', status: 'sent', provider: 'msg91' },
    { channel: 'email', templateKey: 'lab_report_ready', subject: 'Your lab report is ready', status: 'queued', provider: 'msg91' },
    { channel: 'email', templateKey: 'appointment_cancelled', subject: 'Your appointment was cancelled', status: 'sent', provider: 'msg91' },
    { channel: 'sms', templateKey: 'appointment_reminder', subject: null, status: 'queued', provider: 'msg91' },
    { channel: 'sms', templateKey: 'otp_verification', subject: null, status: 'failed', provider: 'msg91' },
    { channel: 'email', templateKey: 'staff_welcome', subject: 'Welcome to Nirogix', status: 'sent', provider: 'msg91' },
  ];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    await runWithTenant(ctx.tenantId, (tx) =>
      tx.insert(notificationLog).values({
        tenantId: ctx.tenantId,
        channel: row.channel,
        recipient: row.channel === 'sms' ? `+9190000000${String(10 + i).slice(-2)}` : `demo.contact${i + 1}@example.com`,
        templateKey: row.templateKey,
        subject: row.subject,
        status: row.status,
        provider: row.provider,
        error: row.status === 'failed' ? 'DLT template not registered for this sender' : null,
        idempotencyKey: `seed:${ctx.code}:notification:${i}`,
        createdAt: dayOffset(-(i + 1), 11, 15),
      }),
    );
  }
  bump(ctx.counts, 'notifications', rows.length);
}

/**
 * Backdated audit entries.
 *
 * Everything this engine does already writes a real audit trail — but all of it is stamped at
 * the moment the seeder ran, which leaves the Audit screen's date range untestable. `audit_log`
 * is append-only at the database level (a trigger blocks UPDATE and DELETE), so the trail
 * cannot be backdated after the fact; these are inserted with their own `created_at` instead,
 * describing ordinary days of use.
 */
async function seedAuditHistory(ctx: Ctx, act: Act, days: number): Promise<void> {
  const existing = await runWithTenant(ctx.tenantId, (tx) =>
    tx
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.tenantId, ctx.tenantId), eq(auditLog.action, 'user.login')))
      .limit(1),
  );
  if (existing.length > 0) return;

  const sample: Array<{ action: string; resourceType: string; severity: 'info' | 'notice' | 'warning' | 'critical'; actor?: string }> = [
    { action: 'user.login', resourceType: 'session', severity: 'info', actor: act.reception },
    { action: 'user.login', resourceType: 'session', severity: 'info', actor: act.doctor },
    { action: 'user.login.failed', resourceType: 'session', severity: 'warning' },
    { action: 'patient.view', resourceType: 'patient', severity: 'info', actor: act.doctor },
    { action: 'invoice.print', resourceType: 'invoice', severity: 'info', actor: act.cashier },
    { action: 'rbac.override.grant', resourceType: 'user', severity: 'notice', actor: act.admin },
    { action: 'entitlement.revoked', resourceType: 'tenant', severity: 'critical', actor: act.admin },
  ];

  let n = 0;
  for (let d = Math.min(days, 30); d >= 1; d--) {
    const entry = sample[d % sample.length]!;
    await runWithTenant(ctx.tenantId, (tx) =>
      tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: entry.actor ?? null,
        action: entry.action,
        severity: entry.severity,
        resourceType: entry.resourceType,
        metadata: { source: 'seed' },
        createdAt: dayOffset(-d, 8 + (d % 9), (d * 7) % 60),
      }),
    );
    n++;
  }
  bump(ctx.counts, 'auditHistory', n);
}

/**
 * Two permission overrides, because "explicit DENY beats GRANT" and "a temporary grant expires"
 * are rules that cannot be tested without a record that carries them (invariant #3, ADR-010).
 */
async function seedOverrides(ctx: Ctx, spec: SeedTenantSpec, act: Act): Promise<void> {
  const cashier = spec.users.find((u) => u.role === 'cashier');
  const reception = spec.users.find((u) => u.role === 'receptionist');
  const cashierId = cashier ? ctx.users.get(cashier.email) : undefined;
  const receptionId = reception ? ctx.users.get(reception.email) : undefined;
  if (!cashierId && !receptionId) return;

  const already = await runWithTenant(ctx.tenantId, (tx) =>
    tx.execute<{ id: string }>(sql`select id from user_permission_overrides where tenant_id = ${ctx.tenantId} limit 1`),
  );
  if (already.rows.length > 0) return;

  if (receptionId) {
    await setOverride(ctx.tenantId, {
      userId: receptionId,
      permission: 'billing.invoice.view',
      effect: 'GRANT',
      validUntil: dayOffset(14, 23, 59),
      reason: 'Covering the billing desk while the cashier is on leave',
      createdBy: act.admin,
    });
    bump(ctx.counts, 'overridesGrant');
  }
  if (cashierId) {
    await setOverride(ctx.tenantId, {
      userId: cashierId,
      permission: 'patient.record.update',
      effect: 'DENY',
      reason: 'Corrections must go through the front desk',
      createdBy: act.admin,
    });
    bump(ctx.counts, 'overridesDeny');
  }
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

async function seedProviders(ctx: Ctx, spec: SeedTenantSpec, act: Act): Promise<void> {
  for (const p of spec.providers ?? []) {
    const existing = await runWithTenant(ctx.tenantId, (tx) =>
      tx
        .select({ id: providers.id })
        .from(providers)
        .where(and(eq(providers.tenantId, ctx.tenantId), eq(providers.registrationNumber, p.registrationNumber)))
        .limit(1),
    );
    let providerId = existing[0]?.id;
    if (!providerId) {
      const created = await createProvider(ctx.tenantId, {
        fullName: p.fullName,
        userId: p.userEmail ? ctx.users.get(p.userEmail) : undefined,
        qualification: p.qualification,
        registrationNumber: p.registrationNumber,
        consultationFeePaise: p.consultationFeePaise ?? null,
      });
      providerId = created.id;
      await assignSpecialty(ctx.tenantId, providerId, { specialtyCode: p.specialty, isPrimary: true });
      bump(ctx.counts, 'providers');
    }
    if (p.schedule?.length) {
      const current = await runWithTenant(ctx.tenantId, (tx) =>
        tx.execute<{ id: string }>(sql`select id from provider_schedules where tenant_id = ${ctx.tenantId} and provider_id = ${providerId} limit 1`),
      );
      if (current.rows.length === 0) {
        await setSchedules(ctx.tenantId, providerId, p.schedule, act.admin);
        bump(ctx.counts, 'providerSchedules');
      }
    }
    // A doctor who has left still owns their past consultations — deactivated, never deleted.
    if (p.isActive === false) {
      await runWithTenant(ctx.tenantId, (tx) =>
        tx.update(providers).set({ isActive: false, updatedAt: new Date() }).where(eq(providers.id, providerId!)),
      );
      bump(ctx.counts, 'providersInactive');
    }
  }

  const rows = await runWithTenant(ctx.tenantId, (tx) =>
    tx
      .select({ id: providers.id })
      .from(providers)
      .where(and(eq(providers.tenantId, ctx.tenantId), eq(providers.isActive, true)))
      .orderBy(asc(providers.createdAt)),
  );
  ctx.providerIds = rows.map((x) => x.id);
}

async function seedPatients(ctx: Ctx, spec: SeedTenantSpec, act: Act, historyDays: number): Promise<void> {
  const list = spec.patients ?? [];
  if (list.length === 0) return;

  const existing = await runWithTenant(ctx.tenantId, (tx) =>
    tx.select({ id: patientsTable.id }).from(patientsTable).where(eq(patientsTable.tenantId, ctx.tenantId)).limit(1),
  );

  if (existing.length === 0) {
    for (let i = 0; i < list.length; i++) {
      const { status, immunizations, ...input } = list[i]!;
      const created = await createPatient(
        ctx.tenantId,
        { ...input, branchId: ctx.branchIds[i % Math.max(1, ctx.branchIds.length)] ?? null },
        act.reception,
      );
      bump(ctx.counts, 'patients');

      // Registration dates spread backwards, so the Patients date-range filter has something to
      // cut on — and so nobody has a visit older than the day they registered. The last two are
      // deliberately recent *and* activity-free: that is the brand-new-patient case.
      const isFresh = i >= list.length - 2;
      const registeredAt = isFresh ? dayOffset(-(1 + (i % 3)), 12, 30) : dayOffset(-(historyDays + 15 + i * 9), 11, 0);
      await backdatePatient(ctx.tenantId, created.id, registeredAt);

      if (status === 'inactive') {
        await runWithTenant(ctx.tenantId, (tx) =>
          tx.update(patientsTable).set({ status: 'inactive', updatedAt: new Date() }).where(eq(patientsTable.id, created.id)),
        );
        bump(ctx.counts, 'patientsInactive');
      }
      for (const im of immunizations ?? []) {
        await addImmunization(ctx.tenantId, created.id, { ...im, source: 'system' }, act.doctor ?? act.reception);
        bump(ctx.counts, 'immunizations');
      }
    }
  }

  // Only active patients take part in the story — an inactive chart with today's appointment
  // on it would be a bug in the dataset, not a test case.
  const rows = await runWithTenant(ctx.tenantId, (tx) =>
    tx
      .select({ id: patientsTable.id })
      .from(patientsTable)
      .where(and(eq(patientsTable.tenantId, ctx.tenantId), eq(patientsTable.status, 'active')))
      .orderBy(asc(patientsTable.uhid)),
  );
  ctx.patientIds = rows.map((x) => x.id);
}

// ---------------------------------------------------------------------------
// One tenant, end to end
// ---------------------------------------------------------------------------

async function seedTenant(spec: SeedTenantSpec, dataset: SeedDataset): Promise<SeedReport> {
  const tenantId = await upsertTenant(spec);
  const ctx: Ctx = {
    tenantId,
    code: spec.code,
    modules: spec.kind === 'platform' ? (spec.modules ?? []) : (spec.modules ?? BUILT_MODULES),
    branchIds: [],
    departmentIds: [],
    providerIds: [],
    patientIds: [],
    labTestIds: [],
    drugIds: [],
    serviceIds: [],
    users: new Map(),
    counts: {},
  };

  for (const u of spec.users) {
    ctx.users.set(u.email, await upsertUser(tenantId, u, dataset.password));
    bump(ctx.counts, 'users');
    if (u.status === 'inactive') bump(ctx.counts, 'usersInactive');
  }
  const act = actors(ctx, spec.users);

  // The vendor's own org is not a hospital: no modules, no branches, no clinical data (ADR-022).
  if (spec.kind === 'platform') return { tenant: spec.name, code: spec.code, counts: ctx.counts };

  for (const m of ctx.modules) await grantModule(tenantId, m, { reason: `${dataset.environment} seed` });
  bump(ctx.counts, 'modules', ctx.modules.length);

  for (const b of spec.branches ?? []) {
    ctx.branchIds.push(await upsertBranch(tenantId, b));
    bump(ctx.counts, 'branches');
    if (b.isActive === false) bump(ctx.counts, 'branchesInactive');
  }
  // An inactive branch cannot take a visit, so it is not part of the story rotation.
  const activeBranchFlags = await runWithTenant(tenantId, (tx) =>
    tx.select({ id: branches.id }).from(branches).where(and(eq(branches.tenantId, tenantId), eq(branches.isActive, true))).orderBy(asc(branches.code)),
  );
  ctx.branchIds = activeBranchFlags.map((b) => b.id);

  for (const d of spec.departments ?? []) {
    await upsertDepartment(tenantId, d);
    bump(ctx.counts, 'departments');
    if (d.isActive === false) bump(ctx.counts, 'departmentsInactive');
  }
  const activeDepts = await runWithTenant(tenantId, (tx) =>
    tx
      .select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.tenantId, tenantId), eq(departments.isActive, true)))
      .orderBy(asc(departments.code)),
  );
  ctx.departmentIds = activeDepts.map((d) => d.id);

  if (spec.profile && act.admin) {
    await updateOrganizationProfile(tenantId, spec.profile as Parameters<typeof updateOrganizationProfile>[1], act.admin);
    bump(ctx.counts, 'organizationProfile');
  }
  if (spec.branding) {
    await updateBranding(tenantId, spec.branding, act.admin);
    bump(ctx.counts, 'branding');
  }
  if (spec.selfRegistration !== undefined && act.admin) {
    await setSelfRegistration(tenantId, spec.selfRegistration, act.admin);
  }
  if (spec.onlineBooking !== undefined) {
    await setOnlineBooking(tenantId, spec.onlineBooking, act.admin);
  }

  await seedProviders(ctx, spec, act);
  await seedCatalogues(ctx, spec, act);

  const plan = spec.story === false || spec.story === undefined ? null : spec.story;
  await seedPatients(ctx, spec, act, plan?.historyDays ?? 30);
  if (plan) await seedClinicalStory(ctx, spec, plan, act);

  await seedPublicRequests(ctx, spec, act);
  await seedNotificationLog(ctx);
  await seedAuditHistory(ctx, act, plan?.historyDays ?? 30);
  await seedOverrides(ctx, spec, act);

  return { tenant: spec.name, code: spec.code, counts: ctx.counts };
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/**
 * Apply a dataset. The caller has already run `requireEnvironment()` — this function does not
 * second-guess which database it is talking to, it only writes what it was given.
 */
export async function runSeed(dataset: SeedDataset): Promise<SeedReport[]> {
  // Platform catalogues first: permission keys, specialty codes, master reference data and the
  // system roles every tenant's RBAC is provisioned from. Additive and idempotent.
  await seedPermissionCatalog();
  await seedSpecialtyCatalog();
  await seedReferenceCatalog();
  await reconcileSystemRoles();
  console.log('  catalogues + system roles up to date');

  const reports: SeedReport[] = [];
  for (const spec of dataset.tenants) {
    process.stdout.write(`  ${spec.code} … `);
    const report = await seedTenant(spec, dataset);
    console.log(summarise(report.counts));
    reports.push(report);
  }
  return reports;
}

function summarise(counts: SeedCounts): string {
  const keys = ['users', 'branches', 'departments', 'providers', 'patients', 'appointments', 'visits', 'invoices', 'payments'];
  const parts = keys.filter((k) => counts[k]).map((k) => `${counts[k]} ${k}`);
  return parts.length ? parts.join(', ') : 'configuration only';
}

/** The full per-tenant tally, printed at the end of a run and quoted in the seed report. */
export function printReport(reports: SeedReport[]): void {
  for (const r of reports) {
    const rows = Object.entries(r.counts).filter(([, v]) => v > 0);
    if (rows.length === 0) continue;
    console.log(`\n${r.tenant} (${r.code})`);
    for (const [k, v] of rows.sort(([a], [b]) => a.localeCompare(b))) console.log(`  ${String(v).padStart(4)}  ${k}`);
  }
}

/**
 * Wipe every tenant-scoped table (plus the tenant list and the patient identities that sit
 * outside tenancy) so the next seed starts from nothing.
 *
 * The table list is **discovered**, not maintained by hand: every tenant-scoped table is one
 * with a `tenant_id` column, which is the same rule that decides where RLS is applied. A table
 * added next month is therefore reset without anyone remembering to add it here.
 *
 * The global catalogues (permissions, specialties, reference data, platform branding) are left
 * alone — they are configuration, not demo data, and every seeder re-applies them anyway.
 *
 * This function contains no environment check on purpose: the seeder that calls it has already
 * refused to run anywhere but its own environment, and duplicating that logic in two places is
 * how one copy drifts.
 */
export async function resetSeedData(): Promise<string[]> {
  const { pool } = await import('../db/client');
  const tenantScoped = await findTenantScopedTables(pool);
  const extras = ['tenants', 'patient_identity'];
  const present = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = ANY($1)`,
    [extras],
  );
  const all = [...new Set([...tenantScoped, ...present.rows.map((r) => r.table_name)])];
  if (all.length === 0) return [];
  const quoted = all.map((t) => `"${t}"`).join(', ');
  await pool.query(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
  return all;
}
