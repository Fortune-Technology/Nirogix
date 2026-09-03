import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { grantModule, setModuleStatus } from '../entitlement.service';
import {
  getTenantModuleConfig,
  isCapabilityEntitled,
  listEntitledCapabilities,
  listTenantCapabilities,
  setCapabilityStatus,
} from '../capability.service';

// Exercises the ADR-085 capability tier against a real PostgreSQL: deny-by-exception default-ON,
// explicit disable/re-enable, module-off cascades capability-off, and the configure-time dependency
// rules. Skips cleanly if no DB is reachable (matches entitlement.test.ts).

const CODE = 'CAPTEST';
let ready = false;
let tenantId = '';

async function cleanup(): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [CODE])).rows[0];
  if (!t) return;
  await pool.query('DELETE FROM tenant_capability_entitlements WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM tenant_entitlements WHERE tenant_id = $1', [t.id]);
  await pool.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM notification_log WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [t.id]);
  await pool.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM tenants WHERE id = $1', [t.id]);
}

beforeAll(async () => {
  try {
    await pool.query('SELECT 1');
    await cleanup();
    tenantId = (
      await pool.query('INSERT INTO tenants (name, code) VALUES ($1,$2) RETURNING id', [
        'Cap Test',
        CODE,
      ])
    ).rows[0].id;
    // Modules the capability tests exercise. abdm needs patient (hard dep).
    await grantModule(tenantId, 'billing');
    await grantModule(tenantId, 'patient');
    await grantModule(tenantId, 'abdm');
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[capability] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  if (ready) await cleanup();
});

describe('capability entitlements (deny-by-exception)', () => {
  test('a capability of an entitled module is ON by default (no row needed)', async ({ skip }) => {
    if (!ready) return skip();
    expect(await isCapabilityEntitled(tenantId, 'billing', 'billing.services')).toBe(true);
    expect(await listEntitledCapabilities(tenantId)).toContain('billing.services');
  });

  test('an explicit disable turns it off; re-enable turns it back on', async ({ skip }) => {
    if (!ready) return skip();
    await setCapabilityStatus(tenantId, 'billing', 'billing.services', 'DISABLED');
    expect(await isCapabilityEntitled(tenantId, 'billing', 'billing.services')).toBe(false);
    expect(await listEntitledCapabilities(tenantId)).not.toContain('billing.services');

    await setCapabilityStatus(tenantId, 'billing', 'billing.services', 'ACTIVE');
    expect(await isCapabilityEntitled(tenantId, 'billing', 'billing.services')).toBe(true);
    expect(await listEntitledCapabilities(tenantId)).toContain('billing.services');
  });

  test('a capability is off when its module is not entitled, even with no disable row', async ({
    skip,
  }) => {
    if (!ready) return skip();
    await setModuleStatus(tenantId, 'billing', 'SUSPENDED');
    expect(await isCapabilityEntitled(tenantId, 'billing', 'billing.services')).toBe(false);
    expect(await listEntitledCapabilities(tenantId)).not.toContain('billing.services');
    await grantModule(tenantId, 'billing'); // reactivate for later tests
    expect(await isCapabilityEntitled(tenantId, 'billing', 'billing.services')).toBe(true);
  });

  test('listTenantCapabilities returns entitled modules capabilities with enabled state', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const rows = await listTenantCapabilities(tenantId);
    const byKey = new Map(rows.map((r) => [r.capability, r]));
    // billing + abdm are entitled and declare capabilities; opd/emr/lab are not entitled here.
    expect(byKey.get('billing.services')).toMatchObject({ module: 'billing', enabled: true });
    expect(byKey.has('abdm.verification')).toBe(true);
    expect(byKey.has('opd.referral')).toBe(false);
    // A disable is reflected in the enabled flag.
    await setCapabilityStatus(tenantId, 'billing', 'billing.services', 'DISABLED');
    const after = await listTenantCapabilities(tenantId);
    expect(after.find((r) => r.capability === 'billing.services')?.enabled).toBe(false);
    await setCapabilityStatus(tenantId, 'billing', 'billing.services', 'ACTIVE');
  });

  test('getTenantModuleConfig returns every module by domain with entitled + capability state', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const cfg = await getTenantModuleConfig(tenantId);
    expect(cfg.categories.length).toBeGreaterThan(0);
    const byKey = new Map(cfg.modules.map((m) => [m.key, m]));
    // Every registry module is present, entitled or not.
    expect(byKey.has('patient')).toBe(true);
    expect(byKey.has('radiology')).toBe(true);
    // Entitled here: billing/patient/abdm; not: radiology.
    expect(byKey.get('billing')?.entitled).toBe(true);
    expect(byKey.get('radiology')?.entitled).toBe(false);
    // An entitled module's capabilities carry their enabled state.
    const billing = byKey.get('billing')!;
    expect(billing.capabilities.find((c) => c.key === 'billing.services')?.enabled).toBe(true);
    // Categories only include domains that actually have modules.
    expect(cfg.categories.every((c) => cfg.modules.some((m) => m.category === c.key))).toBe(true);
  });

  test('unknown capability is rejected', async ({ skip }) => {
    if (!ready) return skip();
    await expect(
      setCapabilityStatus(tenantId, 'billing', 'billing.nonexistent', 'DISABLED'),
    ).rejects.toThrow(/Unknown capability/);
  });

  test('cannot disable a capability another enabled capability depends on', async ({ skip }) => {
    if (!ready) return skip();
    // abdm.scan_share depends on abdm.facility; both default-ON.
    await expect(
      setCapabilityStatus(tenantId, 'abdm', 'abdm.facility', 'DISABLED'),
    ).rejects.toThrow(/still required by abdm\.scan_share/);
  });

  test('cannot enable a capability whose dependency is disabled', async ({ skip }) => {
    if (!ready) return skip();
    // Disable the dependent first (allowed), then disable the dependency (now allowed).
    await setCapabilityStatus(tenantId, 'abdm', 'abdm.scan_share', 'DISABLED');
    await setCapabilityStatus(tenantId, 'abdm', 'abdm.facility', 'DISABLED');
    // Re-enabling scan_share while facility is off must be refused.
    await expect(
      setCapabilityStatus(tenantId, 'abdm', 'abdm.scan_share', 'ACTIVE'),
    ).rejects.toThrow(/dependency "abdm\.facility" is not enabled/);
    // Restore in dependency order.
    await setCapabilityStatus(tenantId, 'abdm', 'abdm.facility', 'ACTIVE');
    await setCapabilityStatus(tenantId, 'abdm', 'abdm.scan_share', 'ACTIVE');
    expect(await isCapabilityEntitled(tenantId, 'abdm', 'abdm.scan_share')).toBe(true);
  });
});
