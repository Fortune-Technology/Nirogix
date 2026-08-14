import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { PERMISSIONS } from '@hms/permissions';
import { pool } from '../../../db/client';
import { seedPermissionCatalog, resolvePermissions } from '../../rbac/rbac.service';
import { onboardTenant, listTenants, getTenantDetail } from '../admin.service';

// Operator onboarding (ADR-020): creating a tenant provisions RBAC, grants modules, and creates
// the first org_admin — all isolated. Skips cleanly if no DB is reachable.

const CODE = 'ADMINTEST';
let ready = false;

async function cleanup(): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [CODE])).rows[0];
  if (!t) return;
  await pool.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [t.id]);
  await pool.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM user_permission_overrides WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM user_roles WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM role_permissions WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM roles WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM tenant_entitlements WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM branches WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM users WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM tenants WHERE id = $1', [t.id]);
}

beforeAll(async () => {
  try {
    await pool.query('SELECT 1');
    await seedPermissionCatalog();
    await cleanup();
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[admin] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  if (ready) await cleanup();
});

describe('admin / tenant onboarding', () => {
  test('onboarding creates a tenant, first org_admin, modules and branches', async ({ skip }) => {
    if (!ready) return skip();

    const result = await onboardTenant({
      code: CODE,
      name: 'Admin Test Hospital',
      admin: { email: 'admin@admintest.example', fullName: 'Dr. Test Admin' },
      branches: [{ code: 'MAIN', name: 'Main Branch' }],
    });

    expect(result.tenant.code).toBe(CODE);
    expect(result.admin.email).toBe('admin@admintest.example');
    expect(result.admin.tempPassword.length).toBeGreaterThan(6);

    // The first org_admin resolves the org_admin permission set (not wildcard).
    const userRow = (
      await pool.query('SELECT id FROM users WHERE tenant_id = $1 AND email = $2', [
        result.tenant.id,
        'admin@admintest.example',
      ])
    ).rows[0];
    const resolved = await resolvePermissions(result.tenant.id, userRow.id);
    expect(resolved.wildcard).toBe(false);
    expect(resolved.permissions.has(PERMISSIONS.USERS_VIEW)).toBe(true);
    expect(resolved.permissions.has(PERMISSIONS.PROVIDER_VIEW)).toBe(true);

    // Default MVP modules + the requested branch are provisioned.
    const detail = await getTenantDetail(result.tenant.id);
    expect(detail?.modules).toEqual(expect.arrayContaining(['patient', 'appointment', 'billing']));
    expect(detail?.branches).toHaveLength(1);
    expect(detail?.userCount).toBe(1);
  });

  test('a duplicate tenant code is rejected', async ({ skip }) => {
    if (!ready) return skip();
    await expect(
      onboardTenant({
        code: CODE,
        name: 'Dup',
        admin: { email: 'dup@admintest.example', fullName: 'Dup' },
      }),
    ).rejects.toThrow(/already exists/);
  });

  test('the new tenant appears in the platform tenant list', async ({ skip }) => {
    if (!ready) return skip();
    const tenants = await listTenants();
    expect(tenants.some((t) => t.code === CODE)).toBe(true);
  });
});
