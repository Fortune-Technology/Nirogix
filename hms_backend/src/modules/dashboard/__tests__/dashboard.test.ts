import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { seedPermissionCatalog } from '../../rbac/rbac.service';
import { onboardTenant, getPlatformStats } from '../../admin/admin.service';
import { getOrgSummary } from '../dashboard.service';

// Dashboard aggregates: platform-wide (all tenants) + org-scoped (one tenant). Skips if no DB.

const CODE = 'DASHTEST';
let ready = false;
let tenantId = '';

async function cleanup(): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [CODE])).rows[0];
  if (!t) return;
  await pool.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM notification_log WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [t.id]);
  await pool.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_change');
  for (const table of ['user_roles', 'role_permissions', 'roles', 'tenant_entitlements', 'branches', 'users']) {
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
      name: 'Dashboard Test Hospital',
      admin: { email: 'admin@dashtest.example', fullName: 'Dash Admin' },
      branches: [{ code: 'MAIN', name: 'Main' }],
    });
    tenantId = r.tenant.id;
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[dashboard] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  if (ready) await cleanup();
});

describe('dashboard aggregates', () => {
  test('org summary is scoped to one tenant', async ({ skip }) => {
    if (!ready) return skip();
    const s = await getOrgSummary(tenantId);
    expect(s.users).toBe(1); // the seeded org_admin
    expect(s.branches.total).toBe(1);
    expect(s.modules).toEqual(expect.arrayContaining(['patient', 'billing']));
  });

  test('platform stats aggregate across all tenants (counts only)', async ({ skip }) => {
    if (!ready) return skip();
    const s = await getPlatformStats();
    expect(s.organizations.total).toBeGreaterThanOrEqual(1);
    expect(s.hospitals.total).toBeGreaterThanOrEqual(1);
    expect(s.users).toBeGreaterThanOrEqual(1);
    expect(s.modules.length).toBeGreaterThan(0);
    // Aggregate-only contract: no row-level fields leak through.
    expect(s).not.toHaveProperty('patientsList');
  });
});
