import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { PERMISSIONS } from '@hms/permissions';
import { pool } from '../../../db/client';
import { seedPermissionCatalog, setOverride, removeRoleByKey } from '../../rbac/rbac.service';
import { onboardTenant } from '../../admin/admin.service';
import { createUser, getUserDetail, listUsers, updateUser } from '../user.service';
import { createBranch, listBranches, updateBranch } from '../../branch/branch.service';

// Org-Admin surface: manage users (create, roles, overrides, status) and branches inside a tenant.
// Uses onboarding to create an isolated throwaway tenant. Skips cleanly if no DB.

const CODE = 'A2TEST';
let ready = false;
let tenantId = '';

async function cleanup(): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [CODE])).rows[0];
  if (!t) return;
  await pool.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [t.id]);
  await pool.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_change');
  for (const table of [
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
    await cleanup();
    const r = await onboardTenant({
      code: CODE,
      name: 'A2 Test Hospital',
      admin: { email: 'admin@a2test.example', fullName: 'A2 Admin' },
    });
    tenantId = r.tenant.id;
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[user] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  if (ready) await cleanup();
});

describe('org-admin / user + branch management', () => {
  test('create a user with a role; it appears in the list with effective permissions', async ({ skip }) => {
    if (!ready) return skip();
    const { userId, tempPassword } = await createUser(tenantId, {
      email: 'nurse@a2test.example',
      fullName: 'Test Receptionist',
      roleKey: 'receptionist',
    });
    expect(tempPassword).toBeTruthy();

    const list = await listUsers(tenantId);
    const row = list.find((u) => u.id === userId);
    expect(row?.roles).toContain('receptionist');

    const detail = await getUserDetail(tenantId, userId);
    expect(detail?.permissions).toContain(PERMISSIONS.PATIENT_VIEW);
  });

  test('a DENY override removes a permission the role grants (DENY wins)', async ({ skip }) => {
    if (!ready) return skip();
    const { userId } = await createUser(tenantId, {
      email: 'denied@a2test.example',
      fullName: 'Denied User',
      roleKey: 'receptionist',
    });
    await setOverride(tenantId, { userId, permission: PERMISSIONS.PATIENT_VIEW, effect: 'DENY' });
    const detail = await getUserDetail(tenantId, userId);
    expect(detail?.permissions).not.toContain(PERMISSIONS.PATIENT_VIEW);
    expect(detail?.overrides.some((o) => o.permission === PERMISSIONS.PATIENT_VIEW && o.effect === 'DENY')).toBe(true);
  });

  test('removing a role strips its permissions; suspending a user updates status', async ({ skip }) => {
    if (!ready) return skip();
    const { userId } = await createUser(tenantId, {
      email: 'temp@a2test.example',
      fullName: 'Temp User',
      roleKey: 'receptionist',
    });
    await removeRoleByKey(tenantId, userId, 'receptionist');
    const afterRemove = await getUserDetail(tenantId, userId);
    expect(afterRemove?.roles).toHaveLength(0);

    const updated = await updateUser(tenantId, userId, { status: 'suspended' });
    expect(updated.status).toBe('suspended');
  });

  test('branches can be created and updated', async ({ skip }) => {
    if (!ready) return skip();
    const b = await createBranch(tenantId, { code: 'WEST', name: 'West Wing' });
    expect(b.code).toBe('WEST');
    const list = await listBranches(tenantId);
    expect(list.some((x) => x.code === 'WEST')).toBe(true);
    const updated = await updateBranch(tenantId, b.id, { isActive: false });
    expect(updated.isActive).toBe(false);
  });
});
