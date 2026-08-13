import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { PERMISSIONS } from '@hms/permissions';
import { pool } from '../../../db/client';
import { runWithTenant } from '../../../db/tenantContext';
import { tenants, users } from '../../../db/schema';
import {
  seedPermissionCatalog,
  provisionTenantRbac,
  assignRoleByKey,
  setOverride,
  resolvePermissions,
  hasPermission,
} from '../rbac.service';
import { getCached } from '../permissionCache';

// Exercises the effective-permission resolver: role permissions, DENY-over-GRANT, temporary
// validity windows, and cache invalidation. Uses the shared pool (dev = superuser, which is fine
// here — we test resolution logic, not RLS isolation). Skips cleanly if no DB is reachable.

const CODE = 'RBACTEST';
let ready = false;
let tenantId = '';
let userId = '';

async function cleanup(): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [CODE])).rows[0];
  if (!t) return;
  await pool.query('DELETE FROM users WHERE tenant_id = $1', [t.id]); // cascades roles/overrides/sessions on user
  await pool.query('DELETE FROM roles WHERE tenant_id = $1', [t.id]); // cascades role_permissions
  await pool.query('DELETE FROM branches WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM tenants WHERE id = $1', [t.id]);
}

beforeAll(async () => {
  try {
    await pool.query('SELECT 1');
    await seedPermissionCatalog();
    await cleanup();

    const t = (await pool.query('INSERT INTO tenants (name, code) VALUES ($1,$2) RETURNING id', ['RBAC Test', CODE])).rows[0];
    tenantId = t.id;
    await provisionTenantRbac(tenantId);
    userId = await runWithTenant(tenantId, async (tx) => {
      const rows = await tx
        .insert(users)
        .values({ tenantId, email: 'doc@rbactest.example', passwordHash: 'x', fullName: 'Test Doc' })
        .returning();
      return rows[0]!.id;
    });
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[rbac] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  try {
    if (ready) await cleanup();
  } finally {
    await pool.end();
  }
});

describe('RBAC effective-permission resolution', () => {
  test('role grants its permissions and nothing more', async ({ skip }) => {
    if (!ready) return skip();
    await assignRoleByKey(tenantId, userId, 'doctor');
    const resolved = await resolvePermissions(tenantId, userId);
    expect(hasPermission(resolved, PERMISSIONS.PATIENT_VIEW)).toBe(true);
    expect(hasPermission(resolved, PERMISSIONS.EMR_WRITE)).toBe(true);
    expect(hasPermission(resolved, PERMISSIONS.BILLING_CREATE)).toBe(false);
  });

  test('explicit DENY overrides a role GRANT', async ({ skip }) => {
    if (!ready) return skip();
    await setOverride(tenantId, { userId, permission: PERMISSIONS.PATIENT_VIEW, effect: 'DENY' });
    const resolved = await resolvePermissions(tenantId, userId);
    expect(hasPermission(resolved, PERMISSIONS.PATIENT_VIEW)).toBe(false);
  });

  test('temporary GRANT: active within window, absent when expired', async ({ skip }) => {
    if (!ready) return skip();
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const past = new Date(Date.now() - 60 * 60 * 1000);
    await setOverride(tenantId, { userId, permission: PERMISSIONS.BILLING_CREATE, effect: 'GRANT', validUntil: future });
    await setOverride(tenantId, { userId, permission: PERMISSIONS.USERS_MANAGE, effect: 'GRANT', validUntil: past });
    const resolved = await resolvePermissions(tenantId, userId);
    expect(hasPermission(resolved, PERMISSIONS.BILLING_CREATE)).toBe(true); // within window
    expect(hasPermission(resolved, PERMISSIONS.USERS_MANAGE)).toBe(false); // expired
  });

  test('changing an override invalidates the cache immediately', async ({ skip }) => {
    if (!ready) return skip();
    await resolvePermissions(tenantId, userId); // populate cache
    expect(getCached(tenantId, userId)).toBeDefined();
    await setOverride(tenantId, { userId, permission: PERMISSIONS.LAB_ORDER_VIEW, effect: 'DENY' });
    expect(getCached(tenantId, userId)).toBeUndefined(); // ADR-010: targeted invalidation
  });
});
