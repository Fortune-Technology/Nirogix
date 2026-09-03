import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { seedPermissionCatalog } from '../../rbac/rbac.service';
import { onboardTenant } from '../../admin/admin.service';
import {
  createPatient,
  listPatients,
  getPatient,
  updatePatient,
  countPatients,
} from '../patient.service';

// Patient Management: per-tenant UHID allocation, CRUD, search. Skips if no DB.

const CODE = 'PATTEST';
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
    'patients',
    'user_roles',
    'role_permissions',
    'roles',
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
      name: 'Patient Test Hospital',
      admin: { email: 'admin@pattest.example', fullName: 'Pat Admin' },
    });
    tenantId = r.tenant.id;
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[patient] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  if (ready) await cleanup();
});

describe('patient management', () => {
  test('registering a patient assigns a per-tenant UHID', async ({ skip }) => {
    if (!ready) return skip();
    const p1 = await createPatient(tenantId, {
      firstName: 'Aarav',
      lastName: 'Kulkarni',
      phone: '9820011234',
    });
    expect(p1.uhid).toBe('UHID-000001');
    const p2 = await createPatient(tenantId, {
      firstName: 'Isha',
      lastName: 'Deshpande',
      phone: '9822045678',
    });
    expect(p2.uhid).toBe('UHID-000002');
    expect(await countPatients(tenantId)).toBe(2);
  });

  test('search matches UHID / name / phone', async ({ skip }) => {
    if (!ready) return skip();
    const byName = await listPatients(tenantId, { page: 1, pageSize: 20, search: 'Isha' });
    expect(byName.rows.some((p) => p.firstName === 'Isha')).toBe(true);
    const byUhid = await listPatients(tenantId, { page: 1, pageSize: 20, search: 'UHID-000001' });
    expect(byUhid.total).toBe(1);
    const byPhone = await listPatients(tenantId, { page: 1, pageSize: 20, search: '9820011234' });
    expect(byPhone.total).toBe(1);
  });

  test('get + update a patient', async ({ skip }) => {
    if (!ready) return skip();
    const list = await listPatients(tenantId, { page: 1, pageSize: 20 });
    const target = list.rows[0]!;
    const fetched = await getPatient(tenantId, target.id);
    expect(fetched?.id).toBe(target.id);
    const updated = await updatePatient(tenantId, target.id, { city: 'Pune', status: 'archived' });
    expect(updated.city).toBe('Pune');
    expect(updated.status).toBe('archived');
  });

  test('faceted filters narrow by gender, city and status server-side (ADR-063)', async ({
    skip,
  }) => {
    if (!ready) return skip();
    await createPatient(tenantId, {
      firstName: 'Meera',
      lastName: 'Nair',
      phone: '9800000001',
      gender: 'female',
      city: 'Kochi',
    });
    await createPatient(tenantId, {
      firstName: 'Arjun',
      lastName: 'Rao',
      phone: '9800000002',
      gender: 'male',
      city: 'Kochi',
    });

    const female = await listPatients(tenantId, { page: 1, pageSize: 20, gender: ['female'] });
    expect(female.rows.every((p) => p.gender === 'female')).toBe(true);
    expect(female.rows.some((p) => p.firstName === 'Meera')).toBe(true);

    const kochi = await listPatients(tenantId, { page: 1, pageSize: 20, city: ['Kochi'] });
    expect(kochi.total).toBe(2);

    // Filters compose: a male in Kochi is only Arjun.
    const both = await listPatients(tenantId, {
      page: 1,
      pageSize: 20,
      gender: ['male'],
      city: ['Kochi'],
    });
    expect(both.total).toBe(1);
    expect(both.rows[0]!.firstName).toBe('Arjun');

    // The archived record (from the previous test) is reachable only by asking for it.
    const archived = await listPatients(tenantId, { page: 1, pageSize: 20, status: ['archived'] });
    expect(archived.rows.every((p) => p.status === 'archived')).toBe(true);
    expect(archived.total).toBeGreaterThanOrEqual(1);
  });

  test('registration date range filters on the whole dataset (ADR-063)', async ({ skip }) => {
    if (!ready) return skip();
    const toISO = (d: Date): string => d.toISOString().slice(0, 10);
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);

    // Everyone was registered "now", so a future-only or past-only window is empty…
    expect(
      (await listPatients(tenantId, { page: 1, pageSize: 20, registeredFrom: toISO(tomorrow) }))
        .total,
    ).toBe(0);
    expect(
      (await listPatients(tenantId, { page: 1, pageSize: 20, registeredTo: toISO(yesterday) }))
        .total,
    ).toBe(0);
    // …and a window spanning today returns them.
    const windowed = await listPatients(tenantId, {
      page: 1,
      pageSize: 20,
      registeredFrom: toISO(yesterday),
      registeredTo: toISO(tomorrow),
    });
    expect(windowed.total).toBeGreaterThan(0);
  });
});
