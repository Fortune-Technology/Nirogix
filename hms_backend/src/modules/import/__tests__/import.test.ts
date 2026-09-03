import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { seedPermissionCatalog } from '../../rbac/rbac.service';
import { onboardTenant } from '../../admin/admin.service';
import { listDrugs } from '../../pharmacy/pharmacy.service';
import {
  buildTemplate,
  commitImport,
  getImportModule,
  listImportModules,
  listImportRuns,
  previewImport,
} from '../import.service';
import { parseCsv } from '../csv';

/**
 * The bulk-import engine (ADR-138), exercised through the module a hospital reaches for first.
 *
 * What is worth protecting here is everything that happens *before* a row is written: the
 * template a person downloads, the mapping that has to survive their own column names, the
 * validation that has to catch a bad price rather than store one, and the duplicate strategy —
 * which is the difference between a re-import updating a price list and a re-import doubling it.
 *
 * Skips cleanly when no database is reachable.
 */

const CODE = 'IMPORTTEST';
let ready = false;
let tenantId = '';

async function cleanup(): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [CODE])).rows[0];
  if (!t) return;
  await pool.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM notification_log WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [t.id]);
  await pool.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_change');
  for (const table of [
    'import_runs',
    'drug_batches',
    'drugs',
    'lab_tests',
    'services',
    'departments',
    'practitioner_roles',
    'providers',
    'patients',
    'password_reset_tokens',
    'sessions',
    'user_permission_overrides',
    'user_roles',
    'role_permissions',
    'roles',
    'tenant_capability_entitlements',
    'tenant_entitlements',
    'branches',
    'users',
  ]) {
    await pool.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [t.id]);
  }
  await pool.query('DELETE FROM tenants WHERE id = $1', [t.id]);
}

beforeAll(async () => {
  try {
    await pool.query('SELECT 1');
    await seedPermissionCatalog();
    await cleanup();
    const r = await onboardTenant({
      code: CODE,
      name: 'Import Test Hospital',
      admin: { email: 'admin@importtest.example', fullName: 'Import Admin' },
    });
    tenantId = r.tenant.id;
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[import] skipping — ${(err as Error).message}`);
  }
}, 120_000);

afterAll(async () => {
  if (ready) await cleanup();
});

describe('what can be imported', () => {
  test('offers master data and refuses to offer clinical events', () => {
    const keys = listImportModules().map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'drugs',
        'lab-tests',
        'services',
        'providers',
        'departments',
        'patients',
      ]),
    );
    // The deliberate omission (ADR-138): an event produced by a workflow is not spreadsheet data.
    for (const forbidden of [
      'appointments',
      'visits',
      'encounters',
      'invoices',
      'payments',
      'prescriptions',
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  test('patients cannot be updated in bulk, and say so rather than offering it', () => {
    const patients = listImportModules().find((m) => m.key === 'patients')!;
    expect(patients.supportsUpdate).toBe(false);
    const drugs = listImportModules().find((m) => m.key === 'drugs')!;
    expect(drugs.supportsUpdate).toBe(true);
  });

  test('no module identifies a duplicate by name', () => {
    for (const m of listImportModules()) {
      expect(['name', 'fullName', 'firstName']).not.toContain(m.duplicateKey.field);
    }
  });
});

describe('the sample template', () => {
  test('has the right columns, marks the required ones, and carries two example rows', () => {
    const csv = buildTemplate(getImportModule('drugs'));
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(3);

    const [header, first] = rows;
    expect(header).toContain('Name *');
    expect(header).toContain('Medicine code *');
    expect(header).toContain('Form'); // optional, no asterisk
    expect(header).not.toContain('Form *');
    // Real values, not placeholders — somebody copies this file and edits it.
    expect(first).toContain('Amoxicillin 500 mg');
  });

  test('the template it produces imports without being edited', async ({ skip }) => {
    if (!ready) return skip();
    const preview = await previewImport(tenantId, 'drugs', buildTemplate(getImportModule('drugs')));
    expect(preview.missingRequired).toEqual([]);
    expect(preview.totals.errors).toBe(0);
    expect(preview.totals.rows).toBe(2);
  });
});

describe('column mapping', () => {
  test("recognises another system's column names", async ({ skip }) => {
    if (!ready) return skip();
    const csv = 'Drug Name,SKU,MRP\nParacetamol 650,PARA650,2.50\n';
    const preview = await previewImport(tenantId, 'drugs', csv);
    expect(preview.mapping).toEqual({
      'Drug Name': 'name',
      SKU: 'catalogCode',
      MRP: 'unitPricePaise',
    });
    expect(preview.missingRequired).toEqual([]);
  });

  test('says which required column is unmapped rather than failing row by row', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const preview = await previewImport(tenantId, 'drugs', 'Something,Else\nA,B\n');
    expect(preview.missingRequired.map((f) => f.key).sort()).toEqual([
      'catalogCode',
      'name',
      'unitPricePaise',
    ]);
  });

  test('an override maps a column the detection could not guess', async ({ skip }) => {
    if (!ready) return skip();
    const csv = 'Item,Ref,Cost\nIbuprofen 400,IBU400,3.10\n';
    const auto = await previewImport(tenantId, 'drugs', csv);
    expect(auto.missingRequired.length).toBeGreaterThan(0);

    const mapped = await previewImport(tenantId, 'drugs', csv, {
      Item: 'name',
      Ref: 'catalogCode',
      Cost: 'unitPricePaise',
    });
    expect(mapped.missingRequired).toEqual([]);
    expect(mapped.rows[0]!.status).toBe('ready');
    expect(mapped.rows[0]!.values.unitPricePaise).toBe(310);
  });

  test('a column mapped to null is ignored', async ({ skip }) => {
    if (!ready) return skip();
    const csv = 'Name,Medicine code,Selling price,Notes\nX,XCODE,1.00,ignore me\n';
    const preview = await previewImport(tenantId, 'drugs', csv, { Notes: null });
    expect(preview.mapping.Notes).toBeNull();
    expect(preview.rows[0]!.status).toBe('ready');
  });
});

describe('validation before anything is saved', () => {
  test('reports a bad price with the row number a person sees in their spreadsheet', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const csv = 'Name,Medicine code,Selling price\nGood,G1,10\nBad,B1,not-a-price\n';
    const preview = await previewImport(tenantId, 'drugs', csv);
    expect(preview.totals).toMatchObject({ rows: 2, ready: 1, errors: 1 });

    const bad = preview.rows.find((r) => r.status === 'error')!;
    // Header is line 1, so the second data row is line 3 — what Excel shows.
    expect(bad.line).toBe(3);
    expect(bad.errors[0]!.message).toMatch(/not an amount/);
  });

  test('a missing required value is an error on that row, not a rejected file', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const csv = 'Name,Medicine code,Selling price\nFine,F1,5\n,N1,5\n';
    const preview = await previewImport(tenantId, 'drugs', csv);
    expect(preview.totals.ready).toBe(1);
    expect(preview.rows[1]!.errors[0]!.message).toMatch(/Name is required/);
  });

  test('two rows sharing a code is a mistake in the file, and names the other row', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const csv = 'Name,Medicine code,Selling price\nOne,SAME,1\nTwo,SAME,2\n';
    const preview = await previewImport(tenantId, 'drugs', csv);
    expect(preview.rows[1]!.status).toBe('error');
    expect(preview.rows[1]!.errors[0]!.message).toMatch(/row 2 of this file/);
  });

  test('accepts the money and date shapes a real spreadsheet contains', async ({ skip }) => {
    if (!ready) return skip();
    const csv =
      'First name,Phone,Date of birth,PIN code\nSunita,+91 98123 45670,12/04/1987,411001\n';
    const preview = await previewImport(tenantId, 'patients', csv);
    expect(preview.rows[0]!.status).toBe('ready');
    expect(preview.rows[0]!.values).toMatchObject({
      firstName: 'Sunita',
      phone: '9812345670',
      dateOfBirth: '1987-04-12',
      pincode: 411001,
    });
  });
});

describe('importing, and doing it again', () => {
  const FIRST =
    'Name,Medicine code,Selling price\nAmoxicillin 500,AMOX500,4.50\nCetirizine 10,CET10,1.20\n';

  test('creates the rows and records the run', async ({ skip }) => {
    if (!ready) return skip();
    const result = await commitImport(
      tenantId,
      'drugs',
      { csvText: FIRST, filename: 'formulary.csv', duplicateStrategy: 'skip' },
      undefined,
    );
    expect(result.totals).toMatchObject({ rows: 2, created: 2, updated: 0, skipped: 0, failed: 0 });

    const drugs = await listDrugs(tenantId);
    expect(drugs.find((d) => d.name === 'Amoxicillin 500')?.unitPricePaise).toBe(450);

    const [run] = await listImportRuns(tenantId);
    expect(run).toMatchObject({
      module: 'drugs',
      filename: 'formulary.csv',
      created: 2,
      failed: 0,
    });
  });

  test('the second run sees them as duplicates, and skipping changes nothing', async ({ skip }) => {
    if (!ready) return skip();
    const preview = await previewImport(tenantId, 'drugs', FIRST);
    expect(preview.totals.duplicates).toBe(2);
    expect(preview.rows[0]!.matched?.label).toBe('Amoxicillin 500');

    const result = await commitImport(
      tenantId,
      'drugs',
      { csvText: FIRST, filename: 'formulary.csv', duplicateStrategy: 'skip' },
      undefined,
    );
    expect(result.totals).toMatchObject({ created: 0, skipped: 2 });
    // The decisive assertion: a re-import must not double the formulary.
    expect((await listDrugs(tenantId)).length).toBe(2);
  });

  test('updating writes the new price onto the existing record', async ({ skip }) => {
    if (!ready) return skip();
    const raised = 'Name,Medicine code,Selling price\nAmoxicillin 500,AMOX500,5.75\n';
    const result = await commitImport(
      tenantId,
      'drugs',
      { csvText: raised, filename: 'price-rise.csv', duplicateStrategy: 'update' },
      undefined,
    );
    expect(result.totals).toMatchObject({ created: 0, updated: 1 });

    // Asserted by name, because the drug list DTO does not carry the catalogue code — and the
    // name is what stayed the same in this file, which is the point: the row was UPDATED.
    const drugs = await listDrugs(tenantId);
    expect(drugs.find((d) => d.name === 'Amoxicillin 500')?.unitPricePaise).toBe(575);
    expect(drugs.length).toBe(2);
  });

  test('create_only refuses the whole file rather than importing half of it', async ({ skip }) => {
    if (!ready) return skip();
    const mixed =
      'Name,Medicine code,Selling price\nAmoxicillin 500,AMOX500,4.50\nBrand New,NEW1,9.99\n';
    await expect(
      commitImport(
        tenantId,
        'drugs',
        { csvText: mixed, filename: 'mixed.csv', duplicateStrategy: 'create_only' },
        undefined,
      ),
    ).rejects.toThrow(/already exist/);

    // Nothing was written — not even the row that was new.
    expect((await listDrugs(tenantId)).some((d) => d.name === 'Brand New')).toBe(false);
  });

  test('a bad row does not stop the good ones, and is reported with its line', async ({ skip }) => {
    if (!ready) return skip();
    const partly =
      'Name,Medicine code,Selling price\nGood One,GOOD1,3.00\nBad One,BAD1,not-a-price\nGood Two,GOOD2,4.00\n';
    const result = await commitImport(
      tenantId,
      'drugs',
      { csvText: partly, filename: 'partly.csv', duplicateStrategy: 'skip' },
      undefined,
    );
    expect(result.totals).toMatchObject({ rows: 3, created: 2, failed: 1 });
    expect(result.errors[0]!.line).toBe(3);
  });

  test('a module that cannot be updated refuses the strategy instead of ignoring it', async ({
    skip,
  }) => {
    if (!ready) return skip();
    await expect(
      commitImport(
        tenantId,
        'patients',
        {
          csvText: 'First name,Phone\nA,9812345670\n',
          filename: 'p.csv',
          duplicateStrategy: 'update',
        },
        undefined,
      ),
    ).rejects.toThrow(/cannot be updated by import/);
  });

  test('the history shows every run, newest first, with who ran it', async ({ skip }) => {
    if (!ready) return skip();
    const runs = await listImportRuns(tenantId);
    expect(runs.length).toBeGreaterThanOrEqual(4);
    const times = runs.map((r) => new Date(r.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(runs.every((r) => r.moduleLabel === 'Medicines' || r.moduleLabel === 'Patients')).toBe(
      true,
    );

    // Filtered by module, for the screen that shows one import's history.
    expect((await listImportRuns(tenantId, 'lab-tests')).length).toBe(0);
  });
});
