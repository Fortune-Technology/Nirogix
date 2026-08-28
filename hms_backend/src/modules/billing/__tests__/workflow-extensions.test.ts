import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { AppError } from '../../../http/error';
import { seedPermissionCatalog } from '../../rbac/rbac.service';
import { onboardTenant } from '../../admin/admin.service';
import { createPatient } from '../../patient/patient.service';
import { createProvider, setSchedules, listFreeSlots } from '../../provider/provider.service';
import { createService, updateService, addServiceLine, createInvoice, getInvoice, listServices } from '../billing.service';
import { checkIn } from '../../opd/opd.service';
import { createReferral, listReferrals, cancelReferral } from '../../referral/referral.service';
import { bookAppointment } from '../../appointment/appointment.service';
import { createTest as createLabTest, collectSample, enterResult, verifyResult, getLabOrder } from '../../laboratory/laboratory.service';
import { getEncounterByVisit, saveEncounter, signEncounter } from '../../emr/emr.service';
import { recordPayment } from '../billing.service';
import { createDrug, receiveStock, adjustStock, createSupplier, listDrugs } from '../../pharmacy/pharmacy.service';
import {
  resolveBookingToken,
  submitBookingRequest,
  listBookingRequests,
  approveBookingRequest,
  setOnlineBooking,
} from '../../organization/booking.service';

/**
 * The ADR-067…070 extensions: services catalogue billing, referrals consumed by
 * check-in, weekly rosters gating bookings + the slot grid, the public booking
 * request path (uniform failure + dedupe on approve), lab verification, and
 * ledgered stock corrections. Real PostgreSQL; skips cleanly without one.
 */

const CODE = 'EXTTEST';
let ready = false;
let tenantId = '';
let providerId = '';
let p1 = '';
let actorId = '';

async function cleanup(): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [CODE])).rows[0];
  if (!t) return;
  await pool.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM notification_log WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [t.id]);
  await pool.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_change');
  for (const table of [
    'appointment_requests', 'referrals', 'payments', 'invoice_line_items', 'stock_adjustments', 'dispenses',
    'drug_batches', 'drugs', 'suppliers', 'lab_results', 'lab_orders', 'lab_tests', 'prescriptions', 'diagnoses',
    'encounters', 'visits', 'invoices', 'appointments', 'provider_schedules', 'services', 'patients',
    'organization_profile', 'practitioner_roles', 'providers', 'departments',
    'user_roles', 'role_permissions', 'roles', 'tenant_entitlements', 'branches', 'users',
  ]) {
    await pool.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [t.id]);
  }
  await pool.query('DELETE FROM tenants WHERE id = $1', [t.id]);
}

async function expectAppError(p: Promise<unknown>, status: number, codeOrMsg?: string | RegExp): Promise<AppError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    const e = err as AppError;
    expect(e.statusCode).toBe(status);
    if (typeof codeOrMsg === 'string') expect(e.code).toBe(codeOrMsg);
    if (codeOrMsg instanceof RegExp) expect(e.message).toMatch(codeOrMsg);
    return e;
  }
  throw new Error(`expected AppError(${status}) but the call succeeded`);
}

/** Next occurrence of a weekday (0-6), as YYYY-MM-DD in local time, at least tomorrow. */
function nextWeekday(weekday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

let deptId = '';

beforeAll(async () => {
  try {
    await pool.query('SELECT 1');
    await seedPermissionCatalog();
    await cleanup();
    const r = await onboardTenant({
      code: CODE,
      name: 'Extensions Hospital',
      modules: ['patient', 'appointment', 'opd', 'emr', 'pharmacy', 'laboratory', 'billing'],
      admin: { email: 'admin@exttest.example', fullName: 'Ext Admin' },
    });
    tenantId = r.tenant.id;
    actorId = (await pool.query('SELECT id FROM users WHERE tenant_id = $1 LIMIT 1', [tenantId])).rows[0].id;
    providerId = (await createProvider(tenantId, { fullName: 'Dr. Ext', consultationFeePaise: 10000 })).id;
    p1 = (await createPatient(tenantId, { firstName: 'Ext', lastName: 'One', phone: '9700000001' })).id;
    const dept = (await pool.query(
      `INSERT INTO departments (tenant_id, code, name) VALUES ($1, 'EXTD', 'Ext Dept') RETURNING id`,
      [tenantId],
    )).rows[0];
    deptId = dept.id;
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[workflow-extensions] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  if (ready) await cleanup();
});

describe('services catalogue (ADR-067)', () => {
  test('create, code uppercased + unique, server-priced line, deactivation refuses', async ({ skip }) => {
    if (!ready) return skip();
    const svc = await createService(tenantId, { code: 'dress-s', name: 'Dressing (small)', pricePaise: 15000, taxRateBps: 0 });
    expect(svc.code).toBe('DRESS-S');
    await expectAppError(createService(tenantId, { code: 'DRESS-S', name: 'dup', pricePaise: 1 }), 409);

    const inv = await createInvoice(tenantId, {
      patientId: p1,
      lineItems: [{ itemType: 'consultation', description: 'Consult', quantity: 1, unitPricePaise: 10000 }],
    });
    const after = await addServiceLine(tenantId, inv.id, { serviceId: svc.id, quantity: 2 });
    const line = after.lineItems.find((l) => l.itemType === 'service');
    expect(line?.unitPricePaise).toBe(15000); // the catalogue priced it, not the client
    expect(after.totalPaise).toBe(10000 + 30000);

    // The same service can appear twice — ad-hoc lines carry no source ref on purpose.
    const again = await addServiceLine(tenantId, inv.id, { serviceId: svc.id, quantity: 1 });
    expect(again.lineItems.filter((l) => l.itemType === 'service').length).toBe(2);

    // Custom one-off line.
    const custom = await addServiceLine(tenantId, inv.id, { description: 'Ambulance', unitPricePaise: 50000, quantity: 1 });
    expect(custom.lineItems.some((l) => l.description === 'Ambulance')).toBe(true);

    await updateService(tenantId, svc.id, { isActive: false });
    await expectAppError(addServiceLine(tenantId, inv.id, { serviceId: svc.id }), 422);
    expect((await listServices(tenantId, { activeOnly: true })).find((s) => s.id === svc.id)).toBeUndefined();
  });
});

describe('referrals (ADR-068)', () => {
  test('create from a paid visit; check-in consumes it exactly once; cancel blocks use', async ({ skip }) => {
    if (!ready) return skip();
    // A visit to refer FROM (pay the fee so the consultation could run — not strictly
    // needed to create a referral, but it mirrors the real flow).
    const v = await checkIn(tenantId, { patientId: p1, providerId });
    await recordPayment(tenantId, v.invoice!.id, { amountPaise: 10000, method: 'cash', idempotencyKey: 'ext-ref-fee' });

    const ref = await createReferral(tenantId, { visitId: v.id, toDepartmentId: deptId, reason: 'Ortho opinion' });
    expect(ref.status).toBe('pending');
    expect((await listReferrals(tenantId, { status: 'pending' })).some((r) => r.id === ref.id)).toBe(true);

    // Complete the source visit so the same-day live-visit guard doesn't block the
    // referred check-in (one live visit per patient per day is the rule).
    const e = await getEncounterByVisit(tenantId, v.id);
    await saveEncounter(tenantId, e.id, { version: e.version, diagnoses: [], prescriptions: [], labOrders: [] });
    await signEncounter(tenantId, e.id);

    // Check-in against the referral: patient + department come from it.
    const v2 = await checkIn(tenantId, { patientId: p1, providerId, referralId: ref.id, consultationFeePaise: 0 });
    expect(v2.departmentId).toBe(deptId);
    const done = (await listReferrals(tenantId, {})).find((r) => r.id === ref.id)!;
    expect(done.status).toBe('completed');
    expect(done.resultingVisitId).toBe(v2.id);

    // Consumed is consumed.
    await expectAppError(checkIn(tenantId, { patientId: p1, providerId, referralId: ref.id }), 409, /already been used/);

    // A cancelled referral cannot be used either.
    const ref2 = await createReferral(tenantId, { visitId: v.id, toDepartmentId: deptId, reason: 'Second look' });
    await cancelReferral(tenantId, ref2.id);
    await expectAppError(checkIn(tenantId, { patientId: p1, providerId, referralId: ref2.id }), 409);
    await expectAppError(cancelReferral(tenantId, ref2.id), 409); // only pending cancels
  });
});

describe('weekly roster + slots (ADR-069)', () => {
  test('overlaps rejected; booking outside the window refused; slot grid excludes booked', async ({ skip }) => {
    if (!ready) return skip();
    const doc = await createProvider(tenantId, { fullName: 'Dr. Roster' });
    await expectAppError(
      setSchedules(tenantId, doc.id, [
        { weekday: 1, startTime: '09:00', endTime: '11:00' },
        { weekday: 1, startTime: '10:30', endTime: '12:00' },
      ]),
      422,
      /overlap/i,
    );
    await setSchedules(tenantId, doc.id, [{ weekday: 1, startTime: '09:00', endTime: '10:00', slotMinutes: 15 }]);

    const monday = nextWeekday(1);
    await expectAppError(
      bookAppointment(tenantId, { patientId: p1, providerId: doc.id, scheduledAt: `${monday}T14:00:00` }),
      409,
      /not available/,
    );
    const appt = await bookAppointment(tenantId, { patientId: p1, providerId: doc.id, scheduledAt: `${monday}T09:15:00` });
    expect(appt.status).toBe('booked');

    const slots = await listFreeSlots(tenantId, doc.id, monday);
    expect(slots.hasRoster).toBe(true);
    expect(slots.slots.some((s) => s.label === '09:15')).toBe(false); // taken
    expect(slots.slots.some((s) => s.label === '09:30')).toBe(true);

    // No roster → free-form booking stays allowed and the slot endpoint says so.
    const free = await listFreeSlots(tenantId, providerId, monday);
    expect(free.hasRoster).toBe(false);
  });
});

describe('public appointment requests (ADR-069)', () => {
  test('token resolves uniformly, request converts through dedupe into a real appointment', async ({ skip }) => {
    if (!ready) return skip();
    const settings = await setOnlineBooking(tenantId, true);
    expect(settings.token).toBeTruthy();

    await expectAppError(resolveBookingToken('definitely-not-a-real-token-1234'), 404);

    await submitBookingRequest(settings.token!, {
      firstName: 'Walkin',
      lastName: 'Wisher',
      phone: '9700000042',
      preferredDate: nextWeekday(2),
      preferredTime: '10:00',
      note: 'Knee pain',
    });
    const pending = await listBookingRequests(tenantId, 'pending');
    const req = pending.find((r) => r.phone === '9700000042')!;
    expect(req).toBeTruthy();

    const tuesday = nextWeekday(2);
    const approved = await approveBookingRequest(
      tenantId,
      req.id,
      { scheduledAt: `${tuesday}T10:00:00`, providerId },
      actorId,
    );
    expect(approved.appointmentId).toBeTruthy();
    expect(approved.patientId).toBeTruthy();

    // Second request from the same person: approval trips the duplicate guard, then
    // linking the existing chart resolves it without a second chart.
    await submitBookingRequest(settings.token!, { firstName: 'Walkin', lastName: 'Wisher', phone: '9700000042' });
    const again = (await listBookingRequests(tenantId, 'pending')).find((r) => r.phone === '9700000042')!;
    const dup = await expectAppError(
      approveBookingRequest(tenantId, again.id, { scheduledAt: `${tuesday}T11:00:00`, providerId }, actorId),
      409,
      'DUPLICATE_PATIENT',
    );
    expect((dup.details as { candidates: unknown[] }).candidates.length).toBeGreaterThan(0);
    const linked = await approveBookingRequest(
      tenantId,
      again.id,
      { scheduledAt: `${tuesday}T11:00:00`, providerId, existingPatientId: approved.patientId },
      actorId,
    );
    expect(linked.patientId).toBe(approved.patientId);
  });
});

describe('lab verification + stock corrections (ADR-070)', () => {
  test('resulted → verified; re-entry drops back; adjust ledgers and never goes negative', async ({ skip }) => {
    if (!ready) return skip();
    // Lab: order via an encounter on a fresh patient.
    const p2 = (await createPatient(tenantId, { firstName: 'Ext', lastName: 'Two', phone: '9700000002' })).id;
    const v = await checkIn(tenantId, { patientId: p2, providerId, consultationFeePaise: 0 });
    const hb = await createLabTest(tenantId, { name: 'HB Ext', pricePaise: 0 });
    const e = await getEncounterByVisit(tenantId, v.id);
    const saved = await saveEncounter(tenantId, e.id, {
      version: e.version,
      diagnoses: [],
      prescriptions: [],
      labOrders: [{ testId: hb!.id, testName: 'x' }],
    });
    const orderId = saved.labOrders[0]!.id;

    await expectAppError(verifyResult(tenantId, orderId), 409); // nothing to verify yet
    await collectSample(tenantId, orderId);
    await enterResult(tenantId, orderId, { value: '13' });
    const verified = await verifyResult(tenantId, orderId);
    expect(verified.status).toBe('verified');
    expect(verified.result?.verifiedAt).toBeTruthy();
    await expectAppError(verifyResult(tenantId, orderId), 409); // idempotence is a conflict, not a double sign-off

    // Correcting a verified result demands a fresh sign-off.
    const reentered = await enterResult(tenantId, orderId, { value: '14' });
    expect(reentered.status).toBe('resulted');
    expect(reentered.result?.verifiedAt).toBeNull();

    // Pharmacy: supplier + ledgered adjustment.
    const sup = await createSupplier(tenantId, { name: 'MediSupply' });
    const drug = await createDrug(tenantId, { name: 'Ext Tab', unitPricePaise: 100 });
    await receiveStock(tenantId, drug!.id, { quantity: 10, supplierId: sup.id, batchNo: 'E-1' });
    const after = await adjustStock(tenantId, drug!.id, { delta: -3, reason: 'breakage during recount' });
    expect(after!.onHand).toBe(7);
    await expectAppError(adjustStock(tenantId, drug!.id, { delta: -8, reason: 'cannot go below zero' }), 409);
    const adjRows = (await pool.query('SELECT delta, reason FROM stock_adjustments WHERE tenant_id = $1', [tenantId])).rows;
    expect(adjRows.length).toBe(1);
    expect(adjRows[0].delta).toBe(-3);

    const drugRow = (await listDrugs(tenantId)).find((d) => d.id === drug!.id)!;
    expect(drugRow.onHand).toBe(7);

    // The lab charge stays absent for a zero-priced test (nothing silently billed).
    const invAfter = v.invoice ? await getInvoice(tenantId, v.invoice.id) : null;
    if (invAfter) expect(invAfter.lineItems.some((l) => l.itemType === 'lab')).toBe(false);
    const order = await getLabOrder(tenantId, orderId);
    expect(order.result?.value).toBe('14');
  });
});
