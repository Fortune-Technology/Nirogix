import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { seedPermissionCatalog } from '../../rbac/rbac.service';
import { onboardTenant } from '../../admin/admin.service';
import { getCurrentBranding, updateBranding, resetBranding } from '../branding.service';

// Tenant branding is persisted per tenant and applied through the token seam (ADR-021). Skips if
// no DB is reachable.

const CODE = 'BRANDTEST';
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
    await cleanup();
    const r = await onboardTenant({
      code: CODE,
      name: 'Brand Test Hospital',
      admin: { email: 'admin@brandtest.example', fullName: 'Brand Admin' },
    });
    tenantId = r.tenant.id;
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[branding] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  if (ready) await cleanup();
});

describe('tenant branding', () => {
  test('defaults to nulls (use the default token palette)', async ({ skip }) => {
    if (!ready) return skip();
    const b = await getCurrentBranding(tenantId);
    expect(b.brandColor).toBeNull();
    expect(b.logoUrl).toBeNull();
  });

  test('a colour update persists and is read back', async ({ skip }) => {
    if (!ready) return skip();
    const updated = await updateBranding(tenantId, { brandColor: '#123456', secondaryColor: '#abcdef' });
    expect(updated.brandColor).toBe('#123456');
    const read = await getCurrentBranding(tenantId);
    expect(read.brandColor).toBe('#123456');
    expect(read.secondaryColor).toBe('#abcdef');
  });

  test('reset clears branding back to defaults', async ({ skip }) => {
    if (!ready) return skip();
    await resetBranding(tenantId);
    const b = await getCurrentBranding(tenantId);
    expect(b.brandColor).toBeNull();
    expect(b.secondaryColor).toBeNull();
  });
});
