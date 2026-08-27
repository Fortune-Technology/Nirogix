import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import {
  grantModule,
  isModuleEntitled,
  setModuleStatus,
  listEntitledModules,
} from '../entitlement.service';

// Exercises the entitlement engine: grant/evaluate, hard-dependency enforcement at grant time,
// status transitions, and effective-date evaluation. Skips cleanly if no DB is reachable.

const CODE = 'ENTTEST';
let ready = false;
let tenantId = '';

async function cleanup(): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [CODE])).rows[0];
  if (!t) return;
  await pool.query('DELETE FROM tenant_entitlements WHERE tenant_id = $1', [t.id]);
  // audit rows (written by grantModule) are append-only — disable the trigger to purge.
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
      await pool.query('INSERT INTO tenants (name, code) VALUES ($1,$2) RETURNING id', ['Ent Test', CODE])
    ).rows[0].id;
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[entitlement] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  if (ready) await cleanup();
});

describe('module entitlements', () => {
  test('grant makes a module entitled; ungranted modules are not', async ({ skip }) => {
    if (!ready) return skip();
    expect(await isModuleEntitled(tenantId, 'patient')).toBe(false);
    await grantModule(tenantId, 'patient');
    expect(await isModuleEntitled(tenantId, 'patient')).toBe(true);
    expect(await isModuleEntitled(tenantId, 'ipd')).toBe(false);
  });

  test('hard dependency is enforced at grant time', async ({ skip }) => {
    if (!ready) return skip();
    // OT requires IPD; IPD requires patient. patient is granted, ipd is not.
    await expect(grantModule(tenantId, 'ot')).rejects.toThrow(/hard dependency "ipd"/);
    await grantModule(tenantId, 'ipd'); // patient already entitled → allowed
    await grantModule(tenantId, 'ot'); // ipd now entitled → allowed
    expect(await isModuleEntitled(tenantId, 'ot')).toBe(true);
  });

  test('suspending a module removes entitlement (status + dates evaluated together)', async ({ skip }) => {
    if (!ready) return skip();
    await setModuleStatus(tenantId, 'patient', 'SUSPENDED');
    expect(await isModuleEntitled(tenantId, 'patient')).toBe(false);
    await grantModule(tenantId, 'patient'); // reactivate
    expect(await isModuleEntitled(tenantId, 'patient')).toBe(true);
  });

  test('an expired entitlement (effective_until in the past) is not entitled', async ({ skip }) => {
    if (!ready) return skip();
    await grantModule(tenantId, 'laboratory', { effectiveUntil: new Date(Date.now() - 60_000) });
    expect(await isModuleEntitled(tenantId, 'laboratory')).toBe(false);
    const entitled = await listEntitledModules(tenantId);
    expect(entitled.has('laboratory')).toBe(false);
    expect(entitled.has('patient')).toBe(true);
  });
});
