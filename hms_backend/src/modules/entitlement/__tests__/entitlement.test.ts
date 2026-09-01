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

/**
 * A module is entitled the instant it is granted — the clock-skew bug (31/08/2026).
 *
 * `effective_from` defaults to Postgres's `now()`; the check used to compare it against the Node
 * process's `Date.now()`. Two clocks, and Postgres's routinely lands a millisecond or two ahead, so
 * a module granted and immediately checked could read as "not yet effective". `onboardTenant` does
 * exactly that — grants `patient`, then asks whether `patient` is entitled before granting
 * `appointment` — so a live tenant onboarding could fail outright, and did so intermittently in
 * this suite for a week while being misdiagnosed as a concurrency race.
 *
 * The loop is the test: a single grant-then-check can pass by luck, because the bug only bites when
 * both land inside the skew window. Doing it repeatedly is what makes the window reachable.
 */
describe('a grant is effective immediately (clock skew)', () => {
  test('grant then check, back to back, many times', async ({ skip }) => {
    if (!ready) return skip();

    for (let i = 0; i < 25; i += 1) {
      await pool.query('DELETE FROM tenant_entitlements WHERE tenant_id = $1 AND module = $2', [tenantId, 'emr']);
      await grantModule(tenantId, 'emr');
      // No await of a timer, no re-read delay: the next line is the one that used to fail.
      expect(await isModuleEntitled(tenantId, 'emr')).toBe(true);
      expect((await listEntitledModules(tenantId)).has('emr')).toBe(true);
    }
  });

  test('onboarding’s own pattern — grant a dependency, then depend on it', async ({ skip }) => {
    if (!ready) return skip();
    // `appointment` hard-depends on `patient`. This is the exact sequence onboardTenant runs, and
    // the exact one that failed: the dependency check must see a grant made microseconds earlier.
    for (let i = 0; i < 15; i += 1) {
      await pool.query('DELETE FROM tenant_entitlements WHERE tenant_id = $1 AND module = ANY($2)', [
        tenantId,
        ['patient', 'appointment'],
      ]);
      await grantModule(tenantId, 'patient');
      await expect(grantModule(tenantId, 'appointment')).resolves.not.toThrow();
    }
  });

  test('a genuinely future start date is still not effective', async ({ skip }) => {
    if (!ready) return skip();
    // The fix must not turn the window off. A start date an hour out is not "now".
    await pool.query('DELETE FROM tenant_entitlements WHERE tenant_id = $1 AND module = $2', [tenantId, 'billing']);
    await grantModule(tenantId, 'billing');
    await pool.query(
      "UPDATE tenant_entitlements SET effective_from = now() + interval '1 hour' WHERE tenant_id = $1 AND module = $2",
      [tenantId, 'billing'],
    );
    expect(await isModuleEntitled(tenantId, 'billing')).toBe(false);
    expect((await listEntitledModules(tenantId)).has('billing')).toBe(false);
  });

  test('an expiry in the past is not effective', async ({ skip }) => {
    if (!ready) return skip();
    await pool.query('DELETE FROM tenant_entitlements WHERE tenant_id = $1 AND module = $2', [tenantId, 'pharmacy']);
    await grantModule(tenantId, 'pharmacy');
    await pool.query(
      "UPDATE tenant_entitlements SET effective_until = now() - interval '1 minute' WHERE tenant_id = $1 AND module = $2",
      [tenantId, 'pharmacy'],
    );
    expect(await isModuleEntitled(tenantId, 'pharmacy')).toBe(false);
  });
});
