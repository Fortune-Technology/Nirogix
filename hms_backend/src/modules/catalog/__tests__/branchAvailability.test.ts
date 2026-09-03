import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { AppError } from '../../../http/error';
import { seedPermissionCatalog } from '../../rbac/rbac.service';
import { onboardTenant } from '../../admin/admin.service';
import { createDrug, listDrugs } from '../../pharmacy/pharmacy.service';
import { seedReferenceCatalog, listCatalog } from '../catalog.service';
import { setAvailability, listOverrides } from '../branchAvailability.service';

/**
 * Per-hospital (branch) availability (ADR-073): disabling an item at one hospital does not disable
 * it at another or org-wide; a per-branch price override applies only there; one organization's
 * per-branch config is invisible to another; a foreign branch is refused. Real PostgreSQL; skips
 * cleanly without one.
 */

const CODE_A = 'BAVAILA';
const CODE_B = 'BAVAILB';
let ready = false;
let tenantA = '';
let tenantB = '';
let actorA = '';
let branch1 = '';
let branch2 = '';
let drugId = '';

async function cleanupTenant(code: string): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [code])).rows[0];
  if (!t) return;
  await pool.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM notification_log WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [t.id]);
  await pool.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_change');
  for (const table of [
    'branch_item_availability',
    'drug_batches',
    'drugs',
    'lab_tests',
    'services',
    'tenant_reference_items',
    'organization_profile',
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
    await seedReferenceCatalog();
    await cleanupTenant(CODE_A);
    await cleanupTenant(CODE_B);
    const a = await onboardTenant({
      code: CODE_A,
      name: 'Availability Org A',
      modules: ['patient', 'pharmacy', 'laboratory', 'billing'],
      admin: { email: 'admin@bavaila.example', fullName: 'A Admin' },
    });
    const b = await onboardTenant({
      code: CODE_B,
      name: 'Availability Org B',
      modules: ['pharmacy'],
      admin: { email: 'admin@bavailb.example', fullName: 'B Admin' },
    });
    tenantA = a.tenant.id;
    tenantB = b.tenant.id;
    actorA = (await pool.query('SELECT id FROM users WHERE tenant_id = $1 LIMIT 1', [tenantA]))
      .rows[0].id;
    branch1 = (
      await pool.query(
        `INSERT INTO branches (tenant_id, code, name) VALUES ($1,'H1','Hospital 1') RETURNING id`,
        [tenantA],
      )
    ).rows[0].id;
    branch2 = (
      await pool.query(
        `INSERT INTO branches (tenant_id, code, name) VALUES ($1,'H2','Hospital 2') RETURNING id`,
        [tenantA],
      )
    ).rows[0].id;
    drugId = (await createDrug(
      tenantA,
      { name: 'Paracetamol 500 mg', form: 'tablet', unitPricePaise: 100 },
      actorA,
    ))!.id;
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[branchAvailability] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  if (ready) {
    await cleanupTenant(CODE_A);
    await cleanupTenant(CODE_B);
  }
});

describe('per-hospital availability (ADR-073)', () => {
  test('disabling an item at one hospital does not affect the other or the org-wide list', async ({
    skip,
  }) => {
    if (!ready) return skip();
    await setAvailability(
      tenantA,
      { branchId: branch1, itemType: 'drug', itemRef: drugId, isAvailable: false },
      actorA,
    );

    const atH1 = await listDrugs(tenantA, undefined, branch1);
    const atH2 = await listDrugs(tenantA, undefined, branch2);
    const orgWide = await listDrugs(tenantA);

    expect(atH1.some((d) => d.id === drugId)).toBe(false); // disabled at Hospital 1
    expect(atH2.some((d) => d.id === drugId)).toBe(true); // still available at Hospital 2
    expect(orgWide.some((d) => d.id === drugId)).toBe(true); // still exists org-wide (history-safe)
  });

  test('a per-branch price override applies only at that branch', async ({ skip }) => {
    if (!ready) return skip();
    await setAvailability(
      tenantA,
      {
        branchId: branch2,
        itemType: 'drug',
        itemRef: drugId,
        isAvailable: true,
        priceOverridePaise: 250,
      },
      actorA,
    );
    const atH2 = await listDrugs(tenantA, undefined, branch2);
    const orgWide = await listDrugs(tenantA);
    expect(atH2.find((d) => d.id === drugId)?.unitPricePaise).toBe(250); // overridden at Hospital 2
    expect(orgWide.find((d) => d.id === drugId)?.unitPricePaise).toBe(100); // org price unchanged
  });

  test('vaccines are branch-scoped by catalogue code', async ({ skip }) => {
    if (!ready) return skip();
    await setAvailability(
      tenantA,
      { branchId: branch1, itemType: 'vaccine', itemRef: 'BCG', isAvailable: false },
      actorA,
    );
    const atH1 = await listCatalog(tenantA, 'vaccine', undefined, branch1);
    const atH2 = await listCatalog(tenantA, 'vaccine', undefined, branch2);
    expect(atH1.some((v) => v.code === 'BCG')).toBe(false);
    expect(atH2.some((v) => v.code === 'BCG')).toBe(true);
  });

  test("one organization cannot see another organization's per-branch config", async ({ skip }) => {
    if (!ready) return skip();
    // tenant A has overrides on branch1; tenant B must see none of them.
    const bOverrides = await listOverrides(tenantB, branch1);
    expect(bOverrides.length).toBe(0);
  });

  test('a branch outside the organization is refused', async ({ skip }) => {
    if (!ready) return skip();
    try {
      await setAvailability(
        tenantB,
        { branchId: branch1, itemType: 'drug', itemRef: drugId, isAvailable: false },
        actorA,
      );
      throw new Error('expected the foreign branch to be refused');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(422);
    }
  });
});
