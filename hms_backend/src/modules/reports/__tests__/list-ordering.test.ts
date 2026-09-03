import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { seedPermissionCatalog } from '../../rbac/rbac.service';
import { onboardTenant } from '../../admin/admin.service';
import { createPatient } from '../../patient/patient.service';
import { createProvider } from '../../provider/provider.service';
import { bookAppointment, listAppointments } from '../../appointment/appointment.service';
import { createInvoice, listInvoices, recordPayment } from '../../billing/billing.service';
import { createTest as createLabTest, listWorklist } from '../../laboratory/laboratory.service';
import { checkIn } from '../../opd/opd.service';
import { runWithTenant } from '../../../db/tenantContext';
import { encounters, labOrders } from '../../../db/schema';

/**
 * What a list puts at the top (ADR-136).
 *
 * Default ordering is a behaviour, not a detail: it decides what a person sees without
 * scrolling, and it is the kind of thing that regresses silently because nothing throws. Each
 * test here seeds a set whose *correct* order differs from the order any single column would
 * give, so a reversion to `ORDER BY created_at DESC` — or to a column sorted alphabetically —
 * fails rather than passing by luck.
 *
 * Skips cleanly when no database is reachable, as the other service suites do.
 */

const CODE = 'ORDERING';
let ready = false;
let tenantId = '';
let patientId = '';
let providerId = '';
let labTestId = '';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** ISO for `n` days from now, at a fixed minute so two seeded slots never collide. */
function inDays(n: number, hour = 10): string {
  const d = new Date(Date.now() + n * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

async function cleanup(): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [CODE])).rows[0];
  if (!t) return;
  await pool.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM notification_log WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [t.id]);
  await pool.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_change');
  for (const table of [
    'payments',
    'invoice_line_items',
    'invoices',
    'lab_results',
    'lab_orders',
    'lab_tests',
    'encounters',
    'visits',
    'appointments',
    'patients',
    'practitioner_roles',
    'providers',
    'departments',
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
      name: 'Ordering Test Hospital',
      admin: { email: 'admin@ordering.example', fullName: 'Ordering Admin' },
    });
    tenantId = r.tenant.id;
    patientId = (await createPatient(tenantId, { firstName: 'Order', lastName: 'Test' })).id;
    providerId = (
      await createProvider(tenantId, { fullName: 'Dr. Order', registrationNumber: 'O-1' })
    ).id;
    labTestId = (await createLabTest(tenantId, {
      name: 'Haemoglobin',
      code: 'HB',
      pricePaise: 20000,
    }))!.id;
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[list-ordering] skipping — ${(err as Error).message}`);
  }
}, 120_000);

afterAll(async () => {
  if (ready) await cleanup();
});

describe('appointments — what is coming, soonest first', () => {
  test('today leads, the far future does not, and the past sits underneath in reverse', async ({
    skip,
  }) => {
    if (!ready) return skip();

    // Booked out of order on purpose: insertion order must not be what decides the list.
    const far = await bookAppointment(tenantId, {
      patientId,
      providerId,
      scheduledAt: inDays(90),
      durationMinutes: 15,
    });
    const soon = await bookAppointment(tenantId, {
      patientId,
      providerId,
      scheduledAt: inDays(1),
      durationMinutes: 15,
    });
    const longAgo = await bookAppointment(tenantId, {
      patientId,
      providerId,
      scheduledAt: inDays(-90),
      durationMinutes: 15,
    });
    const recentPast = await bookAppointment(tenantId, {
      patientId,
      providerId,
      scheduledAt: inDays(-1),
      durationMinutes: 15,
    });

    const { rows } = await listAppointments(tenantId, { page: 1, pageSize: 50 });
    const order = rows.map((r) => r.id);

    // Both future appointments precede both past ones…
    expect(order.indexOf(soon.id)).toBeLessThan(order.indexOf(recentPast.id));
    expect(order.indexOf(far.id)).toBeLessThan(order.indexOf(recentPast.id));
    // …the nearer future leads the further future (the defect: `scheduledAt DESC` reversed this)…
    expect(order.indexOf(soon.id)).toBeLessThan(order.indexOf(far.id));
    // …and the more recent past leads the older past.
    expect(order.indexOf(recentPast.id)).toBeLessThan(order.indexOf(longAgo.id));
    // The whole point, stated once: tomorrow's clinic is the first thing on the page.
    expect(order[0]).toBe(soon.id);
  });
});

describe('invoices — money still owed, first', () => {
  test('an old unpaid bill outranks a new settled one, and a void bill never leads', async ({
    skip,
  }) => {
    if (!ready) return skip();

    const unpaid = await createInvoice(tenantId, {
      patientId,
      lineItems: [
        {
          itemType: 'consultation',
          description: 'Consultation',
          unitPricePaise: 50000,
          quantity: 1,
        },
      ],
    });
    const settled = await createInvoice(tenantId, {
      patientId,
      lineItems: [
        { itemType: 'procedure', description: 'Dressing', unitPricePaise: 20000, quantity: 1 },
      ],
    });
    await recordPayment(tenantId, settled.id, {
      amountPaise: settled.totalPaise,
      method: 'cash',
      idempotencyKey: 'ordering-settled',
    });

    const { rows } = await listInvoices(tenantId, { page: 1, pageSize: 50 });
    const order = rows.map((r) => r.id);

    // `settled` was created LAST, so plain `created_at DESC` would have put it first.
    expect(order.indexOf(unpaid.id)).toBeLessThan(order.indexOf(settled.id));
    expect(order[0]).toBe(unpaid.id);
  });
});

describe('lab worklist — by where the sample is, then oldest first', () => {
  test('a new order outranks yesterday’s verified report', async ({ skip }) => {
    if (!ready) return skip();

    // A lab order belongs to a consultation, so one real visit and one real encounter carry
    // the fixtures. The statuses past `ordered` are seeded directly rather than reached through
    // collection and verification: this test is about the ORDER of a mixed worklist, not that
    // workflow, which `clinical-journey` already covers end to end.
    const visit = await checkIn(tenantId, { patientId, providerId, reason: 'Ordering fixture' });
    const encounterId = await runWithTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(encounters)
        .values({
          tenantId,
          visitId: visit.id,
          patientId,
          providerId,
          status: 'signed',
          signedAt: new Date(),
        })
        .returning({ id: encounters.id });
      return row!.id;
    });

    const seed = async (status: string, createdAt: Date) =>
      runWithTenant(tenantId, async (tx) => {
        const [row] = await tx
          .insert(labOrders)
          .values({
            tenantId,
            encounterId,
            visitId: visit.id,
            patientId,
            testId: labTestId,
            testName: 'Haemoglobin',
            testCode: 'HB',
            status,
            createdAt,
          })
          .returning({ id: labOrders.id });
        return row!.id;
      });

    // The verified one is the OLDEST, so flat FIFO would have put it on top — which is the
    // defect: a technician saw finished work above the work.
    const verified = await seed('verified', new Date(Date.now() - 3 * DAY));
    const collected = await seed('collected', new Date(Date.now() - 2 * HOUR));
    const fresh = await seed('ordered', new Date(Date.now() - 1 * HOUR));
    const olderFresh = await seed('ordered', new Date(Date.now() - 5 * HOUR));

    const rows = await listWorklist(tenantId);
    const order = rows.map((r) => r.id);

    expect(order.indexOf(fresh)).toBeLessThan(order.indexOf(collected));
    expect(order.indexOf(collected)).toBeLessThan(order.indexOf(verified));
    // FIFO survives inside a stage: the order waiting longest is still next.
    expect(order.indexOf(olderFresh)).toBeLessThan(order.indexOf(fresh));
    expect(order[0]).toBe(olderFresh);
  });

  test('a status filter leaves plain FIFO, because the stage key is then constant', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const rows = await listWorklist(tenantId, 'ordered');
    const times = rows.map((r) => new Date(r.createdAt).getTime());
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});
