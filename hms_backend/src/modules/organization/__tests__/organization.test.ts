import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { seedPermissionCatalog } from '../../rbac/rbac.service';
import { onboardTenant } from '../../admin/admin.service';
import { getOrganizationProfile, updateOrganizationProfile, buildContactLines } from '../organization.service';
import { getSetupStatus } from '../../setup/setup.service';
import { listEntitledModules } from '../../entitlement/entitlement.service';

// The hospital's own identity + the Hospital Setup status derived from it (ADR-049).
// Skips if no database is reachable, like the other service tests.

const CODE_A = 'ORGTESTA';
const CODE_B = 'ORGTESTB';
let ready = false;
let tenantA = '';
let tenantB = '';
let adminA = '';

async function cleanupOne(code: string): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [code])).rows[0];
  if (!t) return;
  await pool.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [t.id]);
  await pool.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_change');
  for (const table of [
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

async function cleanup(): Promise<void> {
  await cleanupOne(CODE_A);
  await cleanupOne(CODE_B);
}

beforeAll(async () => {
  try {
    await pool.query('SELECT 1');
    await seedPermissionCatalog();
    await cleanup();
    const a = await onboardTenant({
      code: CODE_A,
      name: 'Org Test Hospital',
      admin: { email: 'admin@orgtesta.example', fullName: 'Org Admin A' },
    });
    const b = await onboardTenant({
      code: CODE_B,
      name: 'Other Hospital',
      admin: { email: 'admin@orgtestb.example', fullName: 'Org Admin B' },
    });
    tenantA = a.tenant.id;
    tenantB = b.tenant.id;
    adminA = (await pool.query('SELECT id FROM users WHERE email = $1', ['admin@orgtesta.example'])).rows[0].id;
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[organization] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  if (ready) await cleanup();
});

describe('organization profile', () => {
  test('starts empty, carrying only the provisioned tenant name and code', async ({ skip }) => {
    if (!ready) return skip();
    const p = await getOrganizationProfile(tenantA);
    expect(p.name).toBe('Org Test Hospital');
    expect(p.code).toBe(CODE_A);
    expect(p.addressLine1).toBeNull();
    expect(p.gstin).toBeNull();
    expect(p.contactLines).toEqual([]);
    expect(p.isComplete).toBe(false);
  });

  test('an update persists, is read back, and completes the profile', async ({ skip }) => {
    if (!ready) return skip();
    const updated = await updateOrganizationProfile(
      tenantA,
      {
        addressLine1: '12 Ashram Road',
        city: 'Ahmedabad',
        state: 'Gujarat',
        postalCode: '380009',
        country: 'India',
        phone: '+91 79 2658 0000',
        email: 'contact@orgtesta.example',
        registrationNumber: 'GJ/CE/2026/0114',
        gstin: '24AAACT2727Q1ZW',
      },
      adminA,
    );
    expect(updated.city).toBe('Ahmedabad');
    expect(updated.isComplete).toBe(true);
    const read = await getOrganizationProfile(tenantA);
    expect(read.gstin).toBe('24AAACT2727Q1ZW');
    expect(read.contactLines[0]).toBe('12 Ashram Road');
  });

  test('a partial update leaves untouched fields alone', async ({ skip }) => {
    if (!ready) return skip();
    await updateOrganizationProfile(tenantA, { phone: '+91 79 2658 1111' }, adminA);
    const p = await getOrganizationProfile(tenantA);
    expect(p.phone).toBe('+91 79 2658 1111');
    expect(p.city).toBe('Ahmedabad');
  });

  test('an empty string clears a field', async ({ skip }) => {
    if (!ready) return skip();
    await updateOrganizationProfile(tenantA, { addressLine2: '' }, adminA);
    const p = await getOrganizationProfile(tenantA);
    expect(p.addressLine2).toBeNull();
  });

  test('one hospital never sees another hospital’s registered details', async ({ skip }) => {
    if (!ready) return skip();
    const other = await getOrganizationProfile(tenantB);
    expect(other.name).toBe('Other Hospital');
    expect(other.addressLine1).toBeNull();
    expect(other.gstin).toBeNull();
    expect(other.isComplete).toBe(false);
  });

  test('an update writes an audit entry', async ({ skip }) => {
    if (!ready) return skip();
    const { rows } = await pool.query(
      "SELECT action FROM audit_log WHERE tenant_id = $1 AND action = 'organization.profile.update' LIMIT 1",
      [tenantA],
    );
    expect(rows).toHaveLength(1);
  });
});

describe('contact lines', () => {
  test('omit what is not configured rather than printing an empty label', () => {
    expect(buildContactLines({ city: 'Surat', state: 'Gujarat' })).toEqual(['Surat, Gujarat']);
    expect(buildContactLines({})).toEqual([]);
    expect(buildContactLines({ phone: '022 1234', email: 'a@b.example' })).toEqual(['Tel 022 1234 · a@b.example']);
  });
});

describe('hospital setup status', () => {
  test('is derived from real data and reports the profile step complete', async ({ skip }) => {
    if (!ready) return skip();
    const s = await getSetupStatus(tenantA);
    expect(s.organization.name).toBe('Org Test Hospital');
    expect(s.steps.find((x) => x.key === 'profile')?.complete).toBe(true);
    expect(s.totalRequired).toBeGreaterThan(0);
    expect(s.completedRequired).toBeLessThanOrEqual(s.totalRequired);
  });

  test('is not ready while staff and providers are missing', async ({ skip }) => {
    if (!ready) return skip();
    const s = await getSetupStatus(tenantA);
    expect(s.steps.find((x) => x.key === 'providers')?.complete).toBe(false);
    expect(s.ready).toBe(false);
  });

  // Departments became a real entity in ADR-050 and gained a step then. The rest of the
  // configuration areas other HMS products offer still do not exist here, and the console
  // must never grow a step for one before the model does.
  test('never contains a step for an area the product does not have', async ({ skip }) => {
    if (!ready) return skip();
    const s = await getSetupStatus(tenantA);
    const keys = s.steps.map((x) => x.key);
    expect(keys).toContain('departments');
    for (const absent of ['sub_departments', 'procedures', 'services', 'packages', 'treatment_plans', 'wards', 'rooms', 'beds']) {
      expect(keys).not.toContain(absent);
    }
  });

  test('only reports a module step when the tenant is entitled to that module', async ({ skip }) => {
    if (!ready) return skip();
    const s = await getSetupStatus(tenantA);
    const entitled = await listEntitledModules(tenantA);
    expect(Boolean(s.steps.find((x) => x.key === 'lab_tests'))).toBe(entitled.has('laboratory'));
    expect(Boolean(s.steps.find((x) => x.key === 'drugs'))).toBe(entitled.has('pharmacy'));
  });

  // Counts are read with an explicit tenant predicate on top of RLS (ADR-015), so two freshly
  // onboarded hospitals report their own numbers even where the connection is privileged.
  test('one hospital’s setup status never counts another hospital’s data', async ({ skip }) => {
    if (!ready) return skip();
    const [a, b] = await Promise.all([getSetupStatus(tenantA), getSetupStatus(tenantB)]);
    expect(b.organization.code).toBe(CODE_B);
    expect(b.steps.find((x) => x.key === 'profile')?.complete).toBe(false);
    expect(a.steps.find((x) => x.key === 'profile')?.complete).toBe(true);
    // Each hospital was onboarded with the same shape, so their branch counts match each other
    // and are small — a cross-tenant leak would show one counting the other's rows too.
    const aBranches = a.steps.find((x) => x.key === 'branches')?.count ?? -1;
    const bBranches = b.steps.find((x) => x.key === 'branches')?.count ?? -1;
    expect(aBranches).toBe(bBranches);
    expect(aBranches).toBeLessThanOrEqual(1);
  });
});
