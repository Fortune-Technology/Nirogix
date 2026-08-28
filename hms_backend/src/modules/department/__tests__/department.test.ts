import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { seedPermissionCatalog } from '../../rbac/rbac.service';
import { onboardTenant } from '../../admin/admin.service';
import { createBranch } from '../../branch/branch.service';
import { createProvider } from '../../provider/provider.service';
import { createDepartment, listDepartments, updateDepartment, getDepartment } from '../department.service';
import { getSetupStatus } from '../../setup/setup.service';

// Departments (ADR-050). Skips if no database is reachable, like the other service tests.

const CODE_A = 'DEPTTESTA';
const CODE_B = 'DEPTTESTB';
let ready = false;
let tenantA = '';
let tenantB = '';
let adminA = '';
let branchA = '';
let branchB = '';
let providerA = '';

async function cleanupOne(code: string): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [code])).rows[0];
  if (!t) return;
  await pool.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM notification_log WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [t.id]);
  await pool.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_change');
  for (const table of [
    'practitioner_roles',
    'departments',
    'providers',
    'organization_profile',
    'tenant_branding',
    'user_permission_overrides',
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
    await cleanupOne(CODE_A);
    await cleanupOne(CODE_B);
    const a = await onboardTenant({
      code: CODE_A,
      name: 'Dept Test Hospital',
      admin: { email: 'admin@depttesta.example', fullName: 'Dept Admin A' },
    });
    const b = await onboardTenant({
      code: CODE_B,
      name: 'Other Dept Hospital',
      admin: { email: 'admin@depttestb.example', fullName: 'Dept Admin B' },
    });
    tenantA = a.tenant.id;
    tenantB = b.tenant.id;
    adminA = (await pool.query('SELECT id FROM users WHERE email = $1', ['admin@depttesta.example'])).rows[0].id;
    branchA = (await createBranch(tenantA, { code: 'MAIN', name: 'Main' })).id;
    branchB = (await createBranch(tenantB, { code: 'MAIN', name: 'Other Main' })).id;
    providerA = (await createProvider(tenantA, { fullName: 'Dr. Test A' })).id;
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[department] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  if (ready) {
    await cleanupOne(CODE_A);
    await cleanupOne(CODE_B);
  }
});

describe('departments', () => {
  test('a hospital starts with none', async ({ skip }) => {
    if (!ready) return skip();
    expect(await listDepartments(tenantA)).toEqual([]);
  });

  test('create stores an uppercase code and reports zero doctors', async ({ skip }) => {
    if (!ready) return skip();
    const d = await createDepartment(tenantA, { code: 'ortho', name: 'Orthopaedics' }, adminA);
    expect(d.code).toBe('ORTHO');
    expect(d.name).toBe('Orthopaedics');
    expect(d.branchId).toBeNull(); // organization-wide by default
    expect(d.providerCount).toBe(0);
    expect(d.isActive).toBe(true);
  });

  test('the code is unique within the hospital', async ({ skip }) => {
    if (!ready) return skip();
    await expect(createDepartment(tenantA, { code: 'ORTHO', name: 'Duplicate' }, adminA)).rejects.toThrow(
      /already exists/i,
    );
  });

  test('the same code is free in another hospital', async ({ skip }) => {
    if (!ready) return skip();
    const other = await createDepartment(tenantB, { code: 'ORTHO', name: 'Orthopaedics' }, adminA);
    expect(other.code).toBe('ORTHO');
  });

  test('a department cannot be scoped to another hospital’s branch', async ({ skip }) => {
    if (!ready) return skip();
    await expect(
      createDepartment(tenantA, { code: 'XRAY', name: 'X-Ray', branchId: branchB }, adminA),
    ).rejects.toThrow(/does not belong to your organization/i);
  });

  test('a department cannot be headed by another hospital’s provider', async ({ skip }) => {
    if (!ready) return skip();
    const otherProvider = await createProvider(tenantB, { fullName: 'Dr. Other' });
    await expect(
      createDepartment(tenantA, { code: 'ENT', name: 'ENT', headProviderId: otherProvider.id }, adminA),
    ).rejects.toThrow(/does not belong to your organization/i);
  });

  test('a valid branch and head are accepted and resolved by name', async ({ skip }) => {
    if (!ready) return skip();
    const d = await createDepartment(
      tenantA,
      { code: 'CARDIO', name: 'Cardiology', branchId: branchA, headProviderId: providerA },
      adminA,
    );
    expect(d.branchName).toBe('Main');
    expect(d.headProviderName).toBe('Dr. Test A');
  });

  test('update changes what was sent and leaves the rest', async ({ skip }) => {
    if (!ready) return skip();
    const before = (await listDepartments(tenantA)).find((d) => d.code === 'CARDIO')!;
    const after = await updateDepartment(tenantA, before.id, { name: 'Cardiology & Cath Lab' }, adminA);
    expect(after.name).toBe('Cardiology & Cath Lab');
    expect(after.branchName).toBe('Main');
    expect(after.headProviderName).toBe('Dr. Test A');
  });

  test('deactivate keeps the record and flips the flag', async ({ skip }) => {
    if (!ready) return skip();
    const d = (await listDepartments(tenantA)).find((x) => x.code === 'ORTHO')!;
    const off = await updateDepartment(tenantA, d.id, { isActive: false }, adminA);
    expect(off.isActive).toBe(false);
    expect(await getDepartment(tenantA, d.id)).toBeTruthy(); // still there — never deleted
    expect((await listDepartments(tenantA, { activeOnly: true })).some((x) => x.code === 'ORTHO')).toBe(false);
  });

  test('deactivation is audited at notice level', async ({ skip }) => {
    if (!ready) return skip();
    const { rows } = await pool.query(
      "SELECT severity FROM audit_log WHERE tenant_id = $1 AND action = 'department.deactivate' LIMIT 1",
      [tenantA],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].severity).toBe('notice');
  });

  test('one hospital never sees another hospital’s departments', async ({ skip }) => {
    if (!ready) return skip();
    const a = await listDepartments(tenantA);
    const b = await listDepartments(tenantB);
    expect(a.map((d) => d.name)).not.toContain('Orthopaedics — B');
    expect(b).toHaveLength(1);
    expect(b[0]!.name).toBe('Orthopaedics');
    expect(await getDepartment(tenantB, b[0]!.id)).toBeTruthy();
    await expect(getDepartment(tenantB, a[0]!.id)).rejects.toThrow(/not found/i);
  });

  test('setup reports the departments step, and it completes', async ({ skip }) => {
    if (!ready) return skip();
    const s = await getSetupStatus(tenantA);
    const step = s.steps.find((x) => x.key === 'departments');
    expect(step).toBeTruthy();
    expect(step!.complete).toBe(true);
    expect(step!.count).toBeGreaterThan(0);
    // Doctors depend on departments now, so the console can explain the order.
    expect(s.steps.find((x) => x.key === 'providers')!.dependsOn).toContain('departments');
  });
});
