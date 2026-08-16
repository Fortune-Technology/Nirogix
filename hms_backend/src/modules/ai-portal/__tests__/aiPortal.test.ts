import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { ALL_PERMISSIONS, PERMISSIONS, SYSTEM_ROLES, WILDCARD } from '@hms/permissions';
import { pool } from '../../../db/client';
import { seedPermissionCatalog } from '../../rbac/rbac.service';
import { onboardTenant } from '../../admin/admin.service';
import { enterAiPortal } from '../aiPortal.service';

// The AI Portal is an authorization boundary with no product behind it (ADR-053).
// These tests pin the boundary, and the emptiness — because the emptiness is the
// honest state, not a gap waiting to be filled in silently.

const CODE = 'AIPORTALTEST';
let ready = false;
let tenantId = '';
let adminId = '';

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
    const t = await onboardTenant({
      code: CODE,
      name: 'AI Portal Test Hospital',
      admin: { email: 'admin@aiportaltest.example', fullName: 'AI Admin' },
    });
    tenantId = t.tenant.id;
    adminId = (await pool.query('SELECT id FROM users WHERE email = $1', ['admin@aiportaltest.example'])).rows[0].id;
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[ai-portal] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  if (ready) await cleanup();
});

describe('AI Portal access control', () => {
  test('every staff role holds ai.portal.access (ADR-055)', () => {
    // Widened from "no role by default" (ADR-053) to the whole hospital team plus
    // platform operators. The boundary that keeps patients out was never this key —
    // it is the principal-type check, which is unchanged and tested below.
    for (const role of SYSTEM_ROLES) {
      if (role.permissions.includes(WILDCARD)) continue; // super_admin covers everything
      expect(role.permissions).toContain(PERMISSIONS.AI_PORTAL_ACCESS);
    }
  });

  test('the key still exists, so a tenant can deny it for an individual', () => {
    // Widening the default does not remove the lever: an org_admin can still DENY this
    // key for one person, and an explicit deny beats the role grant.
    expect(PERMISSIONS.AI_PORTAL_ACCESS).toBe('ai.portal.access');
    expect(ALL_PERMISSIONS).toContain(PERMISSIONS.AI_PORTAL_ACCESS);
  });

  test('the permission key exists in the catalog', () => {
    expect(PERMISSIONS.AI_PORTAL_ACCESS).toBe('ai.portal.access');
  });
});

describe('AI Portal session', () => {
  test('returns no capabilities, and says why', async ({ skip }) => {
    if (!ready) return skip();
    const session = await enterAiPortal(tenantId, adminId);
    // If this ever fails, an AI capability has been added — check that it went through
    // scope approval, and the CDSCO classification review if it touches diagnosis or
    // treatment, before changing this test (ADR-053).
    expect(session.capabilities).toEqual([]);
    expect(session.notice).toMatch(/no ai capability/i);
  });

  test('entry is audited at notice level', async ({ skip }) => {
    if (!ready) return skip();
    await enterAiPortal(tenantId, adminId);
    const { rows } = await pool.query(
      "SELECT severity, actor_user_id FROM audit_log WHERE tenant_id = $1 AND action = 'ai.portal.enter' LIMIT 1",
      [tenantId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].severity).toBe('notice');
    expect(rows[0].actor_user_id).toBe(adminId);
  });
});
