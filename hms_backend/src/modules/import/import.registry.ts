import { and, eq, sql } from 'drizzle-orm';
import { PERMISSIONS } from '@hms/permissions';
import { runWithTenant } from '../../db/tenantContext';
import { drugs, labTests, services, providers, departments, patients } from '../../db/schema';
import { createDrug } from '../pharmacy/pharmacy.service';
import { createTest as createLabTest } from '../laboratory/laboratory.service';
import { createService } from '../billing/billing.service';
import { createProvider } from '../provider/provider.service';
import { createDepartment } from '../department/department.service';
import { createPatient } from '../patient/patient.service';

/**
 * What each module lets a hospital bring in from a spreadsheet (ADR-138).
 *
 * One engine, one screen, one set of rules — a module contributes a **description** of its own
 * data and nothing else. `import.service.ts` does the parsing, mapping, validating, duplicate
 * detection, committing, counting and auditing; nothing below knows a CSV exists.
 *
 * ## What is here, and what is deliberately not
 *
 * Importable: the **master and configuration data** a hospital already has in a spreadsheet
 * before it has ever used this product — its formulary, its test menu, its price list, its
 * doctors, its departments, and the patient register it is migrating.
 *
 * **Not importable, on purpose:** appointments, visits, consultations, prescriptions, lab
 * results, invoices and payments. Those are *events*, produced by a workflow that checks a
 * patient in, prices a fee, gates on payment and signs a note. A spreadsheet that creates them
 * skips every one of those checks, and the damage — a patient billed for a consultation that
 * never happened, a prescription nobody wrote — is not visible until somebody acts on it. The
 * brief asked not to add bulk upload where it creates risk without value; this is that line.
 */

/** How a cell becomes a value, and whether it is acceptable. */
export interface ImportField {
  /** The system field. Also the CSV template's column header. */
  key: string;
  label: string;
  required?: boolean;
  /** What this column holds, shown beside the mapping control and in the template's notes. */
  hint?: string;
  /**
   * Header spellings that should map to this field automatically — what other systems call it.
   * Matched case- and punctuation-insensitively, so `Medicine Name`, `medicine_name` and
   * `MEDICINE NAME` are one alias.
   */
  aliases?: readonly string[];
  /** A realistic value for the sample row. Not a placeholder like "string". */
  example: string;
  /**
   * Turns the raw cell into the value the create function wants, or reports why it cannot.
   * Returning `undefined` means "not provided", which is only an error when `required`.
   */
  parse?: (raw: string) => { value: unknown } | { error: string };
}

export interface ImportModule {
  key: string;
  label: string;
  /** What a person is importing, in their words. Shown on the screen and in the template. */
  description: string;
  /** Creating these records is the same act as creating one by hand, so it is the same key. */
  permission: string;
  fields: readonly ImportField[];
  /**
   * The field whose value identifies the same record twice — a code, an SKU, a registration
   * number. Never a name: two doctors can be called Sharma and two hospitals can stock two
   * things called "Saline".
   */
  duplicateKey: { field: string; label: string };
  /** Finds an existing record by the duplicate key. `null` when there is none. */
  findExisting: (tenantId: string, key: string) => Promise<{ id: string; label: string } | null>;
  create: (
    tenantId: string,
    row: Record<string, unknown>,
    actorUserId?: string,
  ) => Promise<{ id: string }>;
  /** Absent where updating through an import would be wrong — see `patients` below. */
  update?: (
    tenantId: string,
    id: string,
    row: Record<string, unknown>,
    actorUserId?: string,
  ) => Promise<void>;
}

// ---------------------------------------------------------------- shared parsers

/** Rupees in the spreadsheet, paise in the database. `1,250.50`, `₹1250.5` and `1250` all work. */
const money: ImportField['parse'] = (raw) => {
  const cleaned = raw.replace(/[₹,\s]/g, '');
  if (cleaned === '') return { value: undefined };
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return { error: `"${raw}" is not an amount` };
  return { value: Math.round(n * 100) };
};

const integer =
  (opts: { min?: number; max?: number } = {}): ImportField['parse'] =>
  (raw) => {
    const cleaned = raw.replace(/[\s,]/g, '');
    if (cleaned === '') return { value: undefined };
    const n = Number(cleaned);
    if (!Number.isInteger(n)) return { error: `"${raw}" is not a whole number` };
    if (opts.min !== undefined && n < opts.min) return { error: `must be ${opts.min} or more` };
    if (opts.max !== undefined && n > opts.max) return { error: `must be ${opts.max} or less` };
    return { value: n };
  };

/** A closed vocabulary, matched case-insensitively so `Male`, `male` and `MALE` all land. */
const oneOf =
  (allowed: readonly string[]): ImportField['parse'] =>
  (raw) => {
    if (raw === '') return { value: undefined };
    const hit = allowed.find((a) => a.toLowerCase() === raw.trim().toLowerCase());
    return hit ? { value: hit } : { error: `must be one of: ${allowed.join(', ')}` };
  };

/** A calendar date. Accepts what a hospital's spreadsheet actually holds, not only ISO. */
const isoDate: ImportField['parse'] = (raw) => {
  const t = raw.trim();
  if (t === '') return { value: undefined };
  // DD/MM/YYYY first — this is an India-resident product and that is what people type (ADR-030).
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
  if (dmy) {
    const [, d, m, y] = dmy;
    const iso = `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
    return Number.isNaN(Date.parse(iso)) ? { error: `"${raw}" is not a date` } : { value: iso };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t))) return { value: t };
  return { error: `"${raw}" is not a date — use DD/MM/YYYY` };
};

/** Ten digits, however the spreadsheet spaced or prefixed them. */
const indianMobile: ImportField['parse'] = (raw) => {
  const digits = raw.replace(/\D/g, '');
  if (digits === '') return { value: undefined };
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  if (local.length !== 10) return { error: `"${raw}" is not a 10-digit mobile number` };
  return { value: local };
};

// ---------------------------------------------------------------- the modules
//
// Each module's `findExisting` is written out rather than shared: the five differ in which
// column is the code and which is the human label, and a generic helper over five Drizzle tables
// cost more in casts than the five three-line queries it replaced.

export const IMPORT_MODULES: readonly ImportModule[] = [
  {
    key: 'drugs',
    label: 'Medicines',
    description: "Your pharmacy's drug master — what you stock and what it costs.",
    permission: PERMISSIONS.PHARMACY_MANAGE,
    duplicateKey: { field: 'catalogCode', label: 'Medicine code' },
    fields: [
      {
        key: 'name',
        label: 'Name',
        required: true,
        aliases: ['medicine name', 'drug name', 'product', 'item name'],
        example: 'Amoxicillin 500 mg',
      },
      // Stored in `catalog_code`, which ADR-072 uses for "the system catalogue item this drug was
      // adopted from". The two readings agree on the only thing a duplicate key needs: identity.
      // A hospital that adopted from the catalogue already has the code; one typing its own
      // formulary supplies its own, and the column was NULL for them anyway.
      {
        key: 'catalogCode',
        label: 'Medicine code',
        required: true,
        aliases: ['sku', 'code', 'item code', 'product code'],
        hint: 'Your own code, or the catalogue code if this medicine came from it. Used to recognise the medicine on a re-import.',
        example: 'AMOX500',
      },
      { key: 'form', label: 'Form', aliases: ['dosage form', 'type'], example: 'Capsule' },
      { key: 'strength', label: 'Strength', example: '500 mg' },
      {
        key: 'unit',
        label: 'Unit',
        hint: 'What one of it is — capsule, tablet, bottle, vial.',
        example: 'capsule',
      },
      {
        key: 'unitPricePaise',
        label: 'Selling price (₹)',
        required: true,
        aliases: ['price', 'mrp', 'rate', 'selling price'],
        hint: 'In rupees. 4.50 is four rupees fifty paise.',
        example: '4.50',
        parse: money,
      },
      { key: 'hsnSac', label: 'HSN/SAC', aliases: ['hsn', 'sac', 'hsn code'], example: '3004' },
    ],
    findExisting: (tenantId, key) =>
      runWithTenant(tenantId, async (tx) => {
        const rows = await tx
          .select({ id: drugs.id, label: drugs.name })
          .from(drugs)
          .where(
            and(eq(drugs.tenantId, tenantId), sql`lower(${drugs.catalogCode}) = lower(${key})`),
          )
          .limit(1);
        return rows[0] ?? null;
      }),
    create: async (tenantId, row, actor) => {
      const created = await createDrug(tenantId, row as never, actor);
      return { id: (created as { id: string }).id };
    },
    update: async (tenantId, id, row) => {
      await runWithTenant(tenantId, (tx) =>
        tx
          .update(drugs)
          .set({
            name: row.name as string,
            form: (row.form as string) ?? null,
            strength: (row.strength as string) ?? null,
            unit: (row.unit as string) ?? 'unit',
            unitPricePaise: row.unitPricePaise as number,
            hsnSac: (row.hsnSac as string) ?? null,
          })
          .where(and(eq(drugs.tenantId, tenantId), eq(drugs.id, id))),
      );
    },
  },

  {
    key: 'lab-tests',
    label: 'Laboratory tests',
    description: 'Your test menu — what the lab offers, its price, and the normal range.',
    permission: PERMISSIONS.LAB_MANAGE,
    duplicateKey: { field: 'code', label: 'Test code' },
    fields: [
      {
        key: 'name',
        label: 'Name',
        required: true,
        aliases: ['test name', 'investigation'],
        example: 'Haemoglobin',
      },
      {
        key: 'code',
        label: 'Test code',
        required: true,
        aliases: ['code', 'test id', 'short code'],
        hint: 'Your own code. Used to recognise the test on a re-import.',
        example: 'HB',
      },
      {
        key: 'pricePaise',
        label: 'Price (₹)',
        required: true,
        aliases: ['price', 'rate', 'charge'],
        example: '200',
        parse: money,
      },
      {
        key: 'sampleType',
        label: 'Sample',
        aliases: ['specimen', 'sample type'],
        example: 'Blood',
      },
      { key: 'unit', label: 'Unit', example: 'g/dL' },
      {
        key: 'refLow',
        label: 'Normal range from',
        aliases: ['ref low', 'low', 'min'],
        example: '12',
      },
      {
        key: 'refHigh',
        label: 'Normal range to',
        aliases: ['ref high', 'high', 'max'],
        example: '17',
      },
    ],
    findExisting: (tenantId, key) =>
      runWithTenant(tenantId, async (tx) => {
        const rows = await tx
          .select({ id: labTests.id, label: labTests.name })
          .from(labTests)
          .where(and(eq(labTests.tenantId, tenantId), sql`lower(${labTests.code}) = lower(${key})`))
          .limit(1);
        return rows[0] ?? null;
      }),
    create: async (tenantId, row, actor) => {
      const created = await createLabTest(tenantId, row as never, actor);
      return { id: (created as { id: string }).id };
    },
    update: async (tenantId, id, row) => {
      await runWithTenant(tenantId, (tx) =>
        tx
          .update(labTests)
          .set({
            name: row.name as string,
            pricePaise: row.pricePaise as number,
            sampleType: (row.sampleType as string) ?? null,
            unit: (row.unit as string) ?? null,
            refLow: (row.refLow as string) ?? null,
            refHigh: (row.refHigh as string) ?? null,
          })
          .where(and(eq(labTests.tenantId, tenantId), eq(labTests.id, id))),
      );
    },
  },

  {
    key: 'services',
    label: 'Services',
    description: 'Your billable services and procedures, and what each one costs.',
    permission: PERMISSIONS.BILLING_SERVICES_MANAGE,
    duplicateKey: { field: 'code', label: 'Service code' },
    fields: [
      {
        key: 'name',
        label: 'Name',
        required: true,
        aliases: ['service name', 'procedure'],
        example: 'Dressing (small)',
      },
      {
        key: 'code',
        label: 'Service code',
        required: true,
        aliases: ['code', 'service id'],
        example: 'DRESS-S',
      },
      {
        key: 'pricePaise',
        label: 'Price (₹)',
        required: true,
        aliases: ['price', 'rate', 'charge', 'amount'],
        example: '250',
        parse: money,
      },
      {
        key: 'description',
        label: 'Description',
        example: 'Cleaning and dressing of a small wound',
      },
      {
        key: 'taxRateBps',
        label: 'Tax rate (%)',
        aliases: ['gst', 'tax', 'gst %'],
        hint: 'A percentage. 5 means 5%.',
        example: '0',
        parse: (raw) => {
          const cleaned = raw.replace(/[%\s]/g, '');
          if (cleaned === '') return { value: undefined };
          const n = Number(cleaned);
          if (!Number.isFinite(n) || n < 0 || n > 100)
            return { error: `"${raw}" is not a tax percentage` };
          // Basis points, because a rate of 2.5% has to survive the round trip.
          return { value: Math.round(n * 100) };
        },
      },
    ],
    findExisting: (tenantId, key) =>
      runWithTenant(tenantId, async (tx) => {
        const rows = await tx
          .select({ id: services.id, label: services.name })
          .from(services)
          .where(and(eq(services.tenantId, tenantId), sql`lower(${services.code}) = lower(${key})`))
          .limit(1);
        return rows[0] ?? null;
      }),
    create: async (tenantId, row, actor) => {
      const created = await createService(tenantId, row as never, actor);
      return { id: (created as { id: string }).id };
    },
    update: async (tenantId, id, row) => {
      await runWithTenant(tenantId, (tx) =>
        tx
          .update(services)
          .set({
            name: row.name as string,
            pricePaise: row.pricePaise as number,
            description: (row.description as string) ?? null,
            taxRateBps: (row.taxRateBps as number) ?? 0,
          })
          .where(and(eq(services.tenantId, tenantId), eq(services.id, id))),
      );
    },
  },

  {
    key: 'providers',
    label: 'Doctors',
    description: 'Your clinicians, their qualification and their default consultation fee.',
    permission: PERMISSIONS.PROVIDER_MANAGE,
    duplicateKey: { field: 'registrationNumber', label: 'Registration number' },
    fields: [
      {
        key: 'fullName',
        label: 'Full name',
        required: true,
        aliases: ['name', 'doctor name', 'provider name'],
        example: 'Dr. Ananya Sharma',
      },
      {
        key: 'registrationNumber',
        label: 'Registration number',
        required: true,
        aliases: ['reg no', 'registration', 'mci', 'imr', 'council number'],
        hint: 'Their medical council registration. Used to recognise them on a re-import.',
        example: 'MMC-45219',
      },
      {
        key: 'qualification',
        label: 'Qualification',
        aliases: ['degree', 'qualifications'],
        example: 'MBBS, MD (Medicine)',
      },
      {
        key: 'gender',
        label: 'Gender',
        example: 'female',
        parse: oneOf(['male', 'female', 'other']),
      },
      { key: 'email', label: 'Email', example: 'ananya.sharma@example.com' },
      {
        key: 'phone',
        label: 'Phone',
        aliases: ['mobile', 'contact'],
        example: '9812345670',
        parse: indianMobile,
      },
      {
        key: 'consultationFeePaise',
        label: 'Consultation fee (₹)',
        aliases: ['fee', 'consultation fee', 'charges'],
        example: '600',
        parse: money,
      },
    ],
    findExisting: (tenantId, key) =>
      runWithTenant(tenantId, async (tx) => {
        const rows = await tx
          .select({ id: providers.id, label: providers.fullName })
          .from(providers)
          .where(
            and(
              eq(providers.tenantId, tenantId),
              sql`lower(${providers.registrationNumber}) = lower(${key})`,
            ),
          )
          .limit(1);
        return rows[0] ?? null;
      }),
    create: async (tenantId, row, actor) => {
      const created = await createProvider(tenantId, row as never, actor);
      return { id: created.id };
    },
    update: async (tenantId, id, row) => {
      await runWithTenant(tenantId, (tx) =>
        tx
          .update(providers)
          .set({
            fullName: row.fullName as string,
            qualification: (row.qualification as string) ?? null,
            gender: (row.gender as string) ?? null,
            email: (row.email as string) ?? null,
            phone: (row.phone as string) ?? null,
            consultationFeePaise: (row.consultationFeePaise as number) ?? null,
          })
          .where(and(eq(providers.tenantId, tenantId), eq(providers.id, id))),
      );
    },
  },

  {
    key: 'departments',
    label: 'Departments',
    description: 'The departments and clinics your hospital runs.',
    permission: PERMISSIONS.DEPARTMENT_MANAGE,
    duplicateKey: { field: 'code', label: 'Department code' },
    fields: [
      {
        key: 'name',
        label: 'Name',
        required: true,
        aliases: ['department name', 'department'],
        example: 'General Medicine',
      },
      {
        key: 'code',
        label: 'Department code',
        required: true,
        aliases: ['code', 'dept code', 'short code'],
        example: 'GENMED',
      },
      { key: 'description', label: 'Description', example: 'Adult outpatient general medicine' },
    ],
    findExisting: (tenantId, key) =>
      runWithTenant(tenantId, async (tx) => {
        const rows = await tx
          .select({ id: departments.id, label: departments.name })
          .from(departments)
          .where(
            and(
              eq(departments.tenantId, tenantId),
              sql`lower(${departments.code}) = lower(${key})`,
            ),
          )
          .limit(1);
        return rows[0] ?? null;
      }),
    create: async (tenantId, row, actor) => {
      const created = await createDepartment(tenantId, row as never, actor ?? '');
      return { id: created.id };
    },
    update: async (tenantId, id, row) => {
      await runWithTenant(tenantId, (tx) =>
        tx
          .update(departments)
          .set({ name: row.name as string, description: (row.description as string) ?? null })
          .where(and(eq(departments.tenantId, tenantId), eq(departments.id, id))),
      );
    },
  },

  {
    key: 'patients',
    label: 'Patients',
    description: 'An existing patient register being migrated from another system.',
    permission: PERMISSIONS.PATIENT_CREATE,
    duplicateKey: { field: 'phone', label: 'Phone' },
    fields: [
      {
        key: 'firstName',
        label: 'First name',
        required: true,
        aliases: ['name', 'given name', 'patient name'],
        example: 'Sunita',
      },
      { key: 'lastName', label: 'Last name', aliases: ['surname', 'family name'], example: 'Rao' },
      {
        key: 'phone',
        label: 'Phone',
        required: true,
        aliases: ['mobile', 'contact', 'mobile number'],
        hint: 'Ten digits. Used to recognise a patient already on file.',
        example: '9812345670',
        parse: indianMobile,
      },
      {
        key: 'gender',
        label: 'Gender',
        example: 'female',
        parse: oneOf(['male', 'female', 'other']),
      },
      {
        key: 'dateOfBirth',
        label: 'Date of birth',
        aliases: ['dob', 'birth date'],
        hint: 'DD/MM/YYYY.',
        example: '12/04/1987',
        parse: isoDate,
      },
      {
        key: 'bloodGroup',
        label: 'Blood group',
        example: 'O+',
        parse: oneOf(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
      },
      { key: 'email', label: 'Email', example: 'sunita.rao@example.com' },
      { key: 'addressLine', label: 'Address', aliases: ['address'], example: '12 MG Road' },
      { key: 'city', label: 'City', example: 'Pune' },
      { key: 'state', label: 'State', example: 'Maharashtra' },
      {
        key: 'pincode',
        label: 'PIN code',
        aliases: ['pin', 'postal code', 'zip'],
        example: '411001',
        parse: integer({ min: 100000, max: 999999 }),
      },
    ],
    findExisting: (tenantId, key) =>
      runWithTenant(tenantId, async (tx) => {
        const rows = await tx
          .select({ id: patients.id, label: patients.uhid })
          .from(patients)
          .where(and(eq(patients.tenantId, tenantId), eq(patients.phone, key)))
          .limit(1);
        return rows[0] ?? null;
      }),
    create: async (tenantId, row, actor) => {
      // `allowDuplicate` because the import has ALREADY decided what to do about duplicates, by
      // phone, and the caller chose. Leaving the service's own guard on would make the engine's
      // "skip" and "update" strategies unreachable — every row would 409 instead.
      const created = await createPatient(
        tenantId,
        { ...(row as object), allowDuplicate: true } as never,
        actor,
      );
      return { id: created.id };
    },
    // No `update`. A patient's identity is corrected on their chart by somebody who can see the
    // duplicate candidates and the audit trail — not silently, in bulk, from a spreadsheet whose
    // phone column might be a data-entry error. "Skip" is the only safe answer to a matched
    // patient, and the screen offers exactly that.
  },
];

export function findImportModule(key: string): ImportModule | undefined {
  return IMPORT_MODULES.find((m) => m.key === key);
}

/** `Medicine Name`, `medicine_name` and `MEDICINE  NAME` are the same header. */
export function normaliseHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_\-.]+/g, ' ');
}
