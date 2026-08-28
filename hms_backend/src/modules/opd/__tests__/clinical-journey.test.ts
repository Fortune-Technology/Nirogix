import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { AppError } from '../../../http/error';
import { seedPermissionCatalog } from '../../rbac/rbac.service';
import { onboardTenant } from '../../admin/admin.service';
import { createPatient } from '../../patient/patient.service';
import { createProvider } from '../../provider/provider.service';
import { checkIn, getVisit, listQueue, updateStatus } from '../opd.service';
import { getEncounterByVisit, saveEncounter, signEncounter, getEncounter, listPatientEncounters } from '../../emr/emr.service';
import { getInvoice, recordPayment, listInvoices } from '../../billing/billing.service';
import { createTest as createLabTest, listWorklist, collectSample, enterResult } from '../../laboratory/laboratory.service';
import { createDrug, receiveStock, listPendingPrescriptions, dispense, listDrugs } from '../../pharmacy/pharmacy.service';

/**
 * The complete OPD journey, twice, with the workflow rules the modules enforce between
 * steps: register (dedupe) → check in (provider fee, one live visit) → PAY (idempotent,
 * no overpay) → consult (payment gate, optimistic lock, master-linked orders) → lab
 * (collect-then-result, billed once at collection, results survive a re-save) → sign
 * (locks + completes) → pharmacy (signed-only, no double dispense, billed back) —
 * and that patient 1's and patient 2's records never mix. Skips cleanly if no DB.
 */

const CODE = 'JOURNEY';
let ready = false;
let tenantId = '';
let otherTenantId = '';

let doctorFee = 50000; // ₹500 — the provider's configured default
let providerId = '';
let p1 = '';
let p2 = '';
let hbTestId = '';
let pcmDrugId = '';

// Mutable journey state threaded across ordered tests (vitest runs a file serially).
let visit1 = '';
let invoice1 = '';
let enc1 = '';
let enc1Version = 0;
let rx1 = '';
let lab1 = '';
let visit2 = '';
let invoice2 = '';
let enc2 = '';

async function cleanupTenant(code: string): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [code])).rows[0];
  if (!t) return;
  await pool.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change');
  await pool.query('DELETE FROM notification_log WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [t.id]);
  await pool.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_change');
  for (const table of [
    'payments', 'invoice_line_items', 'dispenses', 'drug_batches', 'drugs',
    'lab_results', 'lab_orders', 'lab_tests', 'prescriptions', 'diagnoses', 'encounters',
    'visits', 'invoices', 'appointments', 'patients',
    'practitioner_roles', 'providers', 'departments',
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

beforeAll(async () => {
  try {
    await pool.query('SELECT 1');
    await seedPermissionCatalog();
    await cleanupTenant(CODE);
    await cleanupTenant(`${CODE}2`);

    const r = await onboardTenant({
      code: CODE,
      name: 'Journey Hospital',
      modules: ['patient', 'appointment', 'opd', 'emr', 'pharmacy', 'laboratory', 'billing'],
      admin: { email: 'admin@journey.example', fullName: 'Journey Admin' },
    });
    tenantId = r.tenant.id;
    const r2 = await onboardTenant({
      code: `${CODE}2`,
      name: 'Other Hospital',
      modules: ['patient', 'opd', 'billing'],
      admin: { email: 'admin@journey2.example', fullName: 'Other Admin' },
    });
    otherTenantId = r2.tenant.id;

    providerId = (await createProvider(tenantId, { fullName: 'Dr. Journey', consultationFeePaise: doctorFee })).id;
    p1 = (await createPatient(tenantId, { firstName: 'Asha', lastName: 'Verma', phone: '9811111111', dateOfBirth: '1990-01-01' })).id;
    p2 = (await createPatient(tenantId, { firstName: 'Bharat', lastName: 'Singh', phone: '9822222222', dateOfBirth: '1985-05-05' })).id;

    const hb = await createLabTest(tenantId, { name: 'Hemoglobin', code: 'HB', unit: 'g/dL', refLow: '12', refHigh: '17', pricePaise: 20000 });
    hbTestId = hb!.id;
    const pcm = await createDrug(tenantId, { name: 'Paracetamol 500 mg', unit: 'tablet', unitPricePaise: 200 });
    pcmDrugId = pcm!.id;
    await receiveStock(tenantId, pcmDrugId, { batchNo: 'T-1', expiryDate: '2027-01-01', quantity: 100 });

    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[clinical-journey] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  if (ready) {
    await cleanupTenant(CODE);
    await cleanupTenant(`${CODE}2`);
  }
});

describe('registration — duplicates are a decision, not an accident', () => {
  test('same phone + same name is refused with the matching charts', async ({ skip }) => {
    if (!ready) return skip();
    const err = await expectAppError(
      createPatient(tenantId, { firstName: 'Asha', lastName: 'Verma', phone: '9811111111' }),
      409,
      'DUPLICATE_PATIENT',
    );
    const details = err.details as { candidates: Array<{ uhid: string }> };
    expect(details.candidates.length).toBeGreaterThan(0);
  });

  test('same phone + same DOB is refused even with a different name', async ({ skip }) => {
    if (!ready) return skip();
    await expectAppError(
      createPatient(tenantId, { firstName: 'A', lastName: 'V', phone: '9811111111', dateOfBirth: '1990-01-01' }),
      409,
      'DUPLICATE_PATIENT',
    );
  });

  test('allowDuplicate registers anyway; a different person on the same phone registers cleanly', async ({ skip }) => {
    if (!ready) return skip();
    const dup = await createPatient(tenantId, { firstName: 'Asha', lastName: 'Verma', phone: '9811111111', allowDuplicate: true });
    expect(dup.uhid).toBeTruthy();
    await pool.query('DELETE FROM patients WHERE id = $1', [dup.id]); // keep the journey dataset clean
    const spouse = await createPatient(tenantId, { firstName: 'Deepak', lastName: 'Verma', phone: '9811111111', dateOfBirth: '1988-03-03' });
    expect(spouse.uhid).toBeTruthy();
    await pool.query('DELETE FROM patients WHERE id = $1', [spouse.id]);
  });
});

describe('patient 1 — check-in and payment before consultation', () => {
  test("check-in charges the provider's configured fee when none is supplied", async ({ skip }) => {
    if (!ready) return skip();
    const v = await checkIn(tenantId, { patientId: p1, providerId });
    visit1 = v.id;
    expect(v.status).toBe('checked_in');
    expect(v.tokenNumber).toBe(1);
    expect(v.invoice).toBeTruthy();
    expect(v.invoice!.totalPaise).toBe(doctorFee);
    expect(v.invoice!.balancePaise).toBe(doctorFee);
    invoice1 = v.invoice!.id;
  });

  test('a second walk-in check-in while the visit is live is refused', async ({ skip }) => {
    if (!ready) return skip();
    await expectAppError(checkIn(tenantId, { patientId: p1, providerId }), 409, /already checked in/);
  });

  test('the consultation cannot start while the fee is unpaid (both entry points)', async ({ skip }) => {
    if (!ready) return skip();
    await expectAppError(getEncounterByVisit(tenantId, visit1), 409, /unpaid/);
    await expectAppError(updateStatus(tenantId, visit1, 'in_consultation', undefined), 409, /unpaid/);
  });

  test('overpayment is refused; exact cash settles; the same idempotency key never applies twice; a settled invoice takes no more', async ({ skip }) => {
    if (!ready) return skip();
    await expectAppError(
      recordPayment(tenantId, invoice1, { amountPaise: doctorFee + 1, method: 'cash', idempotencyKey: 'j-p1-over' }),
      422,
    );
    const paid = await recordPayment(tenantId, invoice1, { amountPaise: doctorFee, method: 'cash', idempotencyKey: 'j-p1-fee' });
    expect(paid.status).toBe('paid');
    expect(paid.balancePaise).toBe(0);
    expect(paid.payments[0]?.method).toBe('cash');

    const retried = await recordPayment(tenantId, invoice1, { amountPaise: doctorFee, method: 'cash', idempotencyKey: 'j-p1-fee' });
    expect(retried.payments.length).toBe(1); // retry answered with the original, not re-applied

    await expectAppError(
      recordPayment(tenantId, invoice1, { amountPaise: 100, method: 'cash', idempotencyKey: 'j-p1-extra' }),
      409,
      /settled/,
    );
  });
});

describe('patient 1 — consultation, lab, sign, pharmacy', () => {
  test('after payment the encounter opens; the visit can start consulting', async ({ skip }) => {
    if (!ready) return skip();
    const v = await updateStatus(tenantId, visit1, 'in_consultation', undefined);
    expect(v.status).toBe('in_consultation');
    const e = await getEncounterByVisit(tenantId, visit1);
    enc1 = e.id;
    enc1Version = e.version;
    expect(e.status).toBe('draft');
  });

  test('save with a stale version is a conflict (optimistic lock is CAS)', async ({ skip }) => {
    if (!ready) return skip();
    const body = {
      version: enc1Version,
      chiefComplaint: 'Fever 3 days',
      diagnoses: [{ icd10Code: 'A90', icd10Term: 'Dengue fever', isPrimary: true }],
      prescriptions: [{ drugId: pcmDrugId, drugName: 'whatever the client typed', dose: '500 mg', frequency: '1-0-1', duration: '5 days' }],
      labOrders: [{ testId: hbTestId, testName: 'typed name', priority: 'routine' as const }],
    };
    const saved = await saveEncounter(tenantId, enc1, body);
    enc1Version = saved.version;
    // Master links snapshot the master's names, not the client strings.
    expect(saved.prescriptions[0]?.drugName).toBe('Paracetamol 500 mg');
    expect(saved.labOrders[0]?.testName).toBe('Hemoglobin');
    rx1 = saved.prescriptions[0]!.id;
    lab1 = saved.labOrders[0]!.id;

    await expectAppError(saveEncounter(tenantId, enc1, { ...body, version: enc1Version - 1 }), 409);
  });

  test('a draft prescription is NOT dispensable and not in the pharmacy worklist', async ({ skip }) => {
    if (!ready) return skip();
    const pending = await listPendingPrescriptions(tenantId);
    expect(pending.find((x) => x.id === rx1)).toBeUndefined();
    await expectAppError(dispense(tenantId, { prescriptionId: rx1, drugId: pcmDrugId, quantity: 2 }), 409, /not signed/);
  });

  test('lab: result before collection is refused; collection bills the order exactly once', async ({ skip }) => {
    if (!ready) return skip();
    await expectAppError(enterResult(tenantId, lab1, { value: '10' }), 409, /Collect the sample/);

    await collectSample(tenantId, lab1);
    let inv = await getInvoice(tenantId, invoice1);
    expect(inv.lineItems.filter((l) => l.itemType === 'lab').length).toBe(1);
    expect(inv.totalPaise).toBe(doctorFee + 20000);

    await expectAppError(collectSample(tenantId, lab1), 409); // collect twice → conflict

    const resulted = await enterResult(tenantId, lab1, { value: '10' });
    expect(resulted.status).toBe('resulted');
    expect(resulted.result?.flag).toBe('low'); // 10 < refLow 12, derived from the master

    // Still exactly one lab line after the result (billed at collection, deduped after).
    inv = await getInvoice(tenantId, invoice1);
    expect(inv.lineItems.filter((l) => l.itemType === 'lab').length).toBe(1);
  });

  test('re-saving the draft does NOT destroy the collected order or its result (the cascade-delete bug)', async ({ skip }) => {
    if (!ready) return skip();
    // The doctor keeps writing after the sample was taken — send a save WITHOUT the lab
    // order in the payload at all: a progressed order must survive anyway.
    const saved = await saveEncounter(tenantId, enc1, {
      version: enc1Version,
      chiefComplaint: 'Fever 3 days, day 2 review',
      diagnoses: [{ icd10Code: 'A90', icd10Term: 'Dengue fever', isPrimary: true }],
      prescriptions: [{ id: rx1, drugId: pcmDrugId, drugName: 'Paracetamol 500 mg', dose: '650 mg', frequency: '1-1-1' }],
      labOrders: [],
    });
    enc1Version = saved.version;
    expect(saved.labOrders.length).toBe(1); // preserved, not deleted
    expect(saved.labOrders[0]?.status).toBe('resulted');
    expect(saved.prescriptions[0]?.id).toBe(rx1); // updated in place, same row
    expect(saved.prescriptions[0]?.dose).toBe('650 mg');
    const order = (await listWorklist(tenantId, undefined, p1)).find((o) => o.id === lab1);
    expect(order?.result?.value).toBe('10'); // the result row survived
  });

  test('signing completes the visit; signed is immutable; completed visit takes no transitions', async ({ skip }) => {
    if (!ready) return skip();
    const signed = await signEncounter(tenantId, enc1);
    expect(signed.status).toBe('signed');
    const v = await getVisit(tenantId, visit1);
    expect(v.status).toBe('completed');

    await expectAppError(signEncounter(tenantId, enc1), 409);
    await expectAppError(
      saveEncounter(tenantId, enc1, { version: signed.version, diagnoses: [], prescriptions: [], labOrders: [] }),
      409,
    );
    await expectAppError(updateStatus(tenantId, visit1, 'in_consultation', undefined), 409);
  });

  test('pharmacy: signed prescription appears, dispenses once, bills back, never twice', async ({ skip }) => {
    if (!ready) return skip();
    const pending = await listPendingPrescriptions(tenantId);
    const mine = pending.find((x) => x.id === rx1);
    expect(mine).toBeTruthy();
    expect(mine!.drugId).toBe(pcmDrugId);

    const before = (await listDrugs(tenantId)).find((d) => d.id === pcmDrugId)!.onHand;
    const result = await dispense(tenantId, { prescriptionId: rx1, drugId: pcmDrugId, quantity: 10 });
    expect(result.totalPaise).toBe(2000);
    const after = (await listDrugs(tenantId)).find((d) => d.id === pcmDrugId)!.onHand;
    expect(before - after).toBe(10);

    await expectAppError(dispense(tenantId, { prescriptionId: rx1, drugId: pcmDrugId, quantity: 1 }), 409);

    const inv = await getInvoice(tenantId, invoice1);
    expect(inv.lineItems.filter((l) => l.itemType === 'pharmacy').length).toBe(1);
    expect(inv.totalPaise).toBe(doctorFee + 20000 + 2000);
    expect(inv.balancePaise).toBe(20000 + 2000); // consultation already paid

    const settled = await recordPayment(tenantId, invoice1, { amountPaise: 22000, method: 'cash', idempotencyKey: 'j-p1-final' });
    expect(settled.status).toBe('paid');
  });
});

describe('patient 2 — an independent journey; nothing mixes', () => {
  test('patient 2 completes their own visit with different clinical content', async ({ skip }) => {
    if (!ready) return skip();
    const v = await checkIn(tenantId, { patientId: p2, providerId, consultationFeePaise: 30000 }); // explicit override
    visit2 = v.id;
    expect(v.tokenNumber).toBe(2);
    invoice2 = v.invoice!.id;
    expect(v.invoice!.totalPaise).toBe(30000);

    await recordPayment(tenantId, invoice2, { amountPaise: 30000, method: 'cash', idempotencyKey: 'j-p2-fee' });
    const e = await getEncounterByVisit(tenantId, visit2);
    enc2 = e.id;
    const saved = await saveEncounter(tenantId, enc2, {
      version: e.version,
      chiefComplaint: 'Knee pain',
      diagnoses: [{ icd10Code: 'M17.9', icd10Term: 'Osteoarthritis of knee', isPrimary: true }],
      prescriptions: [{ drugName: 'Unstocked Gel', dose: 'apply', frequency: '0-0-1' }], // free text — no master link
      labOrders: [],
    });
    await signEncounter(tenantId, enc2);
    expect(saved.prescriptions[0]?.drugId).toBeNull();
  });

  test('records stay separate: history, worklists, invoices and queues are per patient', async ({ skip }) => {
    if (!ready) return skip();
    const h1 = await listPatientEncounters(tenantId, p1);
    const h2 = await listPatientEncounters(tenantId, p2);
    expect(h1.length).toBe(1);
    expect(h2.length).toBe(1);
    expect(h1[0]!.id).toBe(enc1);
    expect(h2[0]!.id).toBe(enc2);
    expect(h1[0]!.diagnoses[0]?.icd10Code).toBe('A90');
    expect(h2[0]!.diagnoses[0]?.icd10Code).toBe('M17.9');

    const full1 = await getEncounter(tenantId, enc1);
    expect(full1.patientId).toBe(p1);
    expect(full1.prescriptions.length).toBe(1);

    const p1Labs = await listWorklist(tenantId, undefined, p1);
    const p2Labs = await listWorklist(tenantId, undefined, p2);
    expect(p1Labs.length).toBe(1);
    expect(p2Labs.length).toBe(0);

    const inv1List = await listInvoices(tenantId, { patientId: p1, page: 1, pageSize: 10 });
    for (const row of inv1List.rows) expect(row.patientId).toBe(p1);

    const p1Visits = await listQueue(tenantId, { patientId: p1 });
    expect(p1Visits.length).toBe(1);
    expect(p1Visits[0]!.id).toBe(visit1);
  });

  test('another hospital sees none of it', async ({ skip }) => {
    if (!ready) return skip();
    expect(await listQueue(otherTenantId, {})).toEqual([]);
    expect((await listInvoices(otherTenantId, { page: 1, pageSize: 10 })).total).toBe(0);
    await expectAppError(getVisit(otherTenantId, visit1), 404);
    await expectAppError(getEncounter(otherTenantId, enc1), 404);
  });
});
