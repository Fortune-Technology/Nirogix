import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { AppError } from '../../../http/error';
import { seedPermissionCatalog } from '../../rbac/rbac.service';
import { onboardTenant } from '../../admin/admin.service';
import { createPatient } from '../../patient/patient.service';
import { createTest as createLabTest } from '../../laboratory/laboratory.service';
import { listCatalog, createCustomItem } from '../catalog.service';
import { seedReferenceCatalog } from '../catalog.service';
import { addImmunization, listImmunizations } from '../../immunization/immunization.service';

/**
 * System master data + hospital custom data (ADR-072): the global catalogue is readable by every
 * tenant, custom items are tenant-isolated, priced catalogues stay custom-only, adoption records
 * the catalogue code, and the vaccine catalogue feeds a patient immunisation record. Real
 * PostgreSQL; skips cleanly without one.
 */

const CODE_A = 'CATTESTA';
const CODE_B = 'CATTESTB';
let ready = false;
let tenantA = '';
let tenantB = '';
let actorA = '';
let patientA = '';

async function expectAppError(p: Promise<unknown>, status: number): Promise<void> {
  try {
    await p;
  } catch (err) {
    if (err instanceof AppError) {
      expect(err.statusCode).toBe(status);
      return;
    }
    throw err;
  }
  throw new Error(`expected AppError(${status}) but the call succeeded`);
}

async function cleanupTenant(code: string): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [code])).rows[0];
  if (!t) return;
  await pool.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [t.id]);
  await pool.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_change');
  for (const table of [
    'patient_immunizations', 'tenant_reference_items', 'lab_tests', 'patients',
    'organization_profile', 'user_roles', 'role_permissions', 'roles', 'tenant_entitlements',
    'branches', 'users',
  ]) {
    await pool.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [t.id]);
  }
  await pool.query('DELETE FROM tenants WHERE id = $1', [t.id]);
}

beforeAll(async () => {
  try {
    await pool.query('SELECT 1');
    await seedPermissionCatalog();
    await seedReferenceCatalog(); // the global system catalogue
    await cleanupTenant(CODE_A);
    await cleanupTenant(CODE_B);
    const a = await onboardTenant({
      code: CODE_A,
      name: 'Catalog Hospital A',
      modules: ['patient', 'laboratory'],
      admin: { email: 'admin@cattesta.example', fullName: 'A Admin' },
    });
    const b = await onboardTenant({
      code: CODE_B,
      name: 'Catalog Hospital B',
      modules: ['patient'],
      admin: { email: 'admin@cattestb.example', fullName: 'B Admin' },
    });
    tenantA = a.tenant.id;
    tenantB = b.tenant.id;
    actorA = (await pool.query('SELECT id FROM users WHERE tenant_id = $1 LIMIT 1', [tenantA])).rows[0].id;
    patientA = (await createPatient(tenantA, { firstName: 'Imm', lastName: 'One', phone: '9700000009' })).id;
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[catalog] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  if (ready) {
    await cleanupTenant(CODE_A);
    await cleanupTenant(CODE_B);
  }
});

describe('system catalogue (ADR-072)', () => {
  test('global system items are readable and tagged system', async ({ skip }) => {
    if (!ready) return skip();
    const labs = await listCatalog(tenantA, 'lab_test');
    expect(labs.length).toBeGreaterThan(0);
    expect(labs.every((i) => i.source === 'system')).toBe(true);
    expect(labs.some((i) => i.code === 'CBC')).toBe(true);

    const vaccines = await listCatalog(tenantA, 'vaccine');
    expect(vaccines.some((i) => i.code === 'BCG')).toBe(true);
  });

  test('search filters by name or code', async ({ skip }) => {
    if (!ready) return skip();
    const hits = await listCatalog(tenantA, 'lab_test', 'glucose');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((i) => /glucose/i.test(i.name) || /glu/i.test(i.code))).toBe(true);
  });
});

describe('hospital custom data (ADR-072)', () => {
  test('a custom vaccine appears merged and tagged custom, with a CUSTOM_ code', async ({ skip }) => {
    if (!ready) return skip();
    const created = await createCustomItem(tenantA, 'vaccine', { name: 'Yellow Fever' }, actorA);
    expect(created.source).toBe('custom');
    expect(created.code.startsWith('CUSTOM_')).toBe(true);

    const list = await listCatalog(tenantA, 'vaccine', 'yellow');
    expect(list.some((i) => i.source === 'custom' && i.name === 'Yellow Fever')).toBe(true);
  });

  test('custom items are tenant-isolated', async ({ skip }) => {
    if (!ready) return skip();
    // tenant A created "Yellow Fever" above; tenant B must not see it.
    const bVaccines = await listCatalog(tenantB, 'vaccine');
    expect(bVaccines.some((i) => i.name === 'Yellow Fever')).toBe(false);
    // but B still sees the global system items.
    expect(bVaccines.some((i) => i.code === 'BCG')).toBe(true);
  });

  test('priced categories do not accept custom catalogue items', async ({ skip }) => {
    if (!ready) return skip();
    await expectAppError(createCustomItem(tenantA, 'lab_test', { name: 'Nope' }, actorA), 422);
  });
});

describe('adoption + immunisation consumer (ADR-072)', () => {
  test('adopting a catalogue lab test records its catalog_code', async ({ skip }) => {
    if (!ready) return skip();
    const test = await createLabTest(tenantA, {
      name: 'Complete Blood Count (CBC)',
      code: null,
      sampleType: 'blood',
      catalogCode: 'CBC',
      pricePaise: 30000,
    });
    const row = (await pool.query('SELECT catalog_code FROM lab_tests WHERE id = $1', [test!.id])).rows[0];
    expect(row.catalog_code).toBe('CBC');
  });

  test('a recorded immunisation is listed for the patient', async ({ skip }) => {
    if (!ready) return skip();
    await addImmunization(
      tenantA,
      patientA,
      { vaccineCode: 'BCG', vaccineName: 'BCG', source: 'system', dateGiven: '2026-01-15', doseLabel: 'Birth dose' },
      actorA,
    );
    const list = await listImmunizations(tenantA, patientA);
    expect(list.length).toBe(1);
    expect(list[0]!.vaccineCode).toBe('BCG');
    expect(list[0]!.dateGiven).toBe('2026-01-15');
  });
});
