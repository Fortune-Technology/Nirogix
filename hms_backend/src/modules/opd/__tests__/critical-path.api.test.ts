import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { authed, cleanupTenant, dbReady, login, makeTenant, type Session, type TestTenant } from '../../../test-api';
import { pool } from '../../../db/client';
import { createProvider } from '../../provider/provider.service';
import { createDrug, receiveStock } from '../../pharmacy/pharmacy.service';
import { createTest as createLabTest } from '../../laboratory/laboratory.service';

/**
 * The critical hospital workflow end to end, through the HTTP API, with **every stage
 * performed by the role that really performs it** — a different session token per step
 * (testcases.md §OPD/EMR/PHARM/LAB, manual guide §4–§10).
 *
 * `clinical-journey.test.ts` proves the same business rules at the service level, where one
 * caller passes an explicit `tenantId` and authorization does not exist. That is the wrong
 * shape for the question this file asks: *can this hospital actually run a patient through,
 * and does each counter stay inside its own lane?* So nothing here calls a service to assert —
 * the receptionist registers and checks in, the cashier takes the money, the doctor consults
 * and signs, the pharmacist dispenses, the technician results, and each of them holds only
 * their own token. Setup (provider, drug + stock, lab test) has no create-route for every
 * entity, so it uses the services directly; every *asserted* step goes over HTTP.
 *
 * The refusals are the point, not decoration: a pharmacist who can collect a consultation fee,
 * a receptionist who can sign a chart, or a cashier who can dispense a controlled drug is the
 * failure this suite exists to catch. Each refusal is followed by a read proving the state did
 * not move — a 403 that still wrote the row would be worse than no check at all.
 *
 * Skips cleanly when no database is reachable, as the other API suites do.
 */

const CODE = 'CRITPATH';

const FEE_PAISE = 60000; // ₹600 consultation
const DRUG_PRICE_PAISE = 1500; // ₹15 per capsule
const DISPENSE_QTY = 10;
const PHARMACY_PAISE = DRUG_PRICE_PAISE * DISPENSE_QTY; // ₹150
const LAB_PRICE_PAISE = 45000; // ₹450

let ready = false;
let tenant: TestTenant;
const sessions: Record<string, Session> = {};

let providerId = '';
let drugId = '';
let labTestId = '';

// Journey state, threaded across ordered tests (vitest runs one file serially).
let patientId = '';
let patientUhid = '';
let visitId = '';
let invoiceId = '';
let encounterId = '';
let encounterVersion = 0;
let prescriptionId = '';
let labOrderId = '';

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) {
    console.warn('[critical-path.api] skipping — no database');
    return;
  }
  await cleanupTenant(CODE);
  tenant = await makeTenant(CODE, 'Critical Path Hospital');

  for (const role of ['receptionist', 'doctor', 'cashier', 'pharmacist', 'lab_technician'] as const) {
    sessions[role] = await login(CODE, tenant.users[role]!);
  }

  // Master data. No create-route exists for a provider, and drug/lab-test creation belongs to a
  // hospital's setup rather than this journey — so it is done here, and never asserted from here.
  // The provider is linked to the doctor's login so `?mine=true` resolves a real personal queue.
  providerId = (
    await createProvider(tenant.tenantId, {
      fullName: 'Dr. Meera Iyer',
      consultationFeePaise: FEE_PAISE,
      userId: sessions.doctor!.userId,
    })
  ).id;
  drugId = (await createDrug(tenant.tenantId, { name: 'Amoxicillin 500 mg', unit: 'capsule', unitPricePaise: DRUG_PRICE_PAISE }))!.id;
  await receiveStock(tenant.tenantId, drugId, { batchNo: 'CP-1', expiryDate: '2027-06-30', quantity: 100 });
  labTestId = (
    await createLabTest(tenant.tenantId, {
      name: 'Haemoglobin',
      code: 'HB',
      unit: 'g/dL',
      refLow: '12',
      refHigh: '17',
      pricePaise: LAB_PRICE_PAISE,
    })
  )!.id;
}, 180_000);

/**
 * The audit middleware records a mutation from the response's `finish` event and does not await
 * the insert — auditing must never hold up a reply. Supertest resolves the moment the response
 * arrives, so this suite (which ends on mutating calls) can still have audit rows landing after
 * its last assertion, and `audit_log.tenant_id` is ON DELETE RESTRICT. Wait for the count to
 * stop moving before tearing the tenant down. A harness race against a deliberate
 * fire-and-forget — not something the application should change.
 */
async function settleAuditWrites(tenantId: string): Promise<void> {
  let previous = -1;
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const rows = await pool.query('SELECT count(*)::int AS c FROM audit_log WHERE tenant_id = $1', [tenantId]);
    const current = Number(rows.rows[0].c);
    if (current === previous) return;
    previous = current;
  }
}

afterAll(async () => {
  // `tenant` is checked as well as `ready`: when setup fails part-way the teardown must not
  // throw a second, unrelated error on top of the one worth reading.
  if (!ready || !tenant) return;
  await settleAuditWrites(tenant.tenantId);
  await cleanupTenant(CODE);
});

describe('1 — the receptionist registers the patient', () => {
  test('a new chart is created with a UHID, and reads back as the same person', async ({ skip }) => {
    if (!ready) return skip();
    const created = await authed(sessions.receptionist!)
      .post('/api/v1/patients')
      .send({
        firstName: 'Sunita',
        lastName: 'Rao',
        gender: 'female',
        dateOfBirth: '1987-04-12',
        phone: '9812345670',
        city: 'Pune',
      });
    expect(created.status).toBe(201);
    expect(created.body.uhid).toBeTruthy();
    expect(created.body.status).toBe('active');
    patientId = created.body.id;
    patientUhid = created.body.uhid;

    // The row is really there, not merely echoed back by the create handler.
    const fetched = await authed(sessions.receptionist!).get(`/api/v1/patients/${patientId}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.uhid).toBe(patientUhid);
    expect(fetched.body.firstName).toBe('Sunita');
    expect(fetched.body.dateOfBirth).toBe('1987-04-12');
  });
});

describe('2 — the receptionist checks the patient in against the doctor', () => {
  test('a visit, a queue token and a draft consultation invoice all appear at once', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessions.receptionist!)
      .post('/api/v1/visits/check-in')
      .send({ patientId, providerId, reason: 'Fever and fatigue for four days' });
    expect(res.status).toBe(201);
    visitId = res.body.id;

    expect(res.body.status).toBe('checked_in');
    expect(res.body.tokenNumber).toBe(1);
    expect(res.body.patientId).toBe(patientId);
    expect(res.body.patientUhid).toBe(patientUhid);
    expect(res.body.providerId).toBe(providerId);
    expect(res.body.visitNumber).toMatch(/^V-\d{6}$/);

    // The fee was never typed by the front desk — it came from the provider's configured default.
    expect(res.body.invoice).toBeTruthy();
    expect(res.body.invoice.status).toBe('draft');
    expect(res.body.invoice.totalPaise).toBe(FEE_PAISE);
    expect(res.body.invoice.amountPaidPaise).toBe(0);
    expect(res.body.invoice.balancePaise).toBe(FEE_PAISE);
    invoiceId = res.body.invoice.id;
  });

  test('the front desk sees the fee on the visit but is refused the billing ledger — that is the cashier’s counter', async ({ skip }) => {
    if (!ready) return skip();
    const onVisit = await authed(sessions.receptionist!).get(`/api/v1/visits/${visitId}`);
    expect(onVisit.status).toBe(200);
    expect(onVisit.body.invoice.balancePaise).toBe(FEE_PAISE);

    const atBilling = await authed(sessions.receptionist!).get('/api/v1/invoices');
    expect(atBilling.status).toBe(403);
    expect(atBilling.body.error.code).toBe('FORBIDDEN');
  });

  test('the doctor finds the patient waiting in their own queue', async ({ skip }) => {
    if (!ready) return skip();
    // `mine=true` resolves the provider linked to this login — not a filter the client supplies.
    const queue = await authed(sessions.doctor!).get('/api/v1/visits?mine=true');
    expect(queue.status).toBe(200);
    expect(queue.body.length).toBe(1);
    expect(queue.body[0].id).toBe(visitId);
    expect(queue.body[0].patientUhid).toBe(patientUhid);
    expect(queue.body[0].status).toBe('checked_in');
  });
});

describe('3 — the consultation cannot start while the fee is outstanding', () => {
  test('the doctor is refused at both entry points, and no chart is created behind the refusal', async ({ skip }) => {
    if (!ready) return skip();
    const opened = await authed(sessions.doctor!).post('/api/v1/encounters/open').send({ visitId });
    expect(opened.status).toBe(409);
    expect(opened.body.error.code).toBe('CONFLICT');
    expect(opened.body.error.message).toMatch(/unpaid/i);

    const advanced = await authed(sessions.doctor!).patch(`/api/v1/visits/${visitId}/status`).send({ status: 'in_consultation' });
    expect(advanced.status).toBe(409);
    expect(advanced.body.error.message).toMatch(/unpaid/i);

    // The decisive part: the refusal left nothing behind — no draft encounter, visit unmoved.
    const chart = await authed(sessions.doctor!).get(`/api/v1/visits/${visitId}/encounter`);
    expect(chart.status).toBe(404);
    const visit = await authed(sessions.doctor!).get(`/api/v1/visits/${visitId}`);
    expect(visit.body.status).toBe('checked_in');
  });
});

describe('4 — the cashier collects the consultation fee', () => {
  test('a pharmacist cannot take the money, and the attempt leaves the balance untouched', async ({ skip }) => {
    if (!ready) return skip();
    const attempt = await authed(sessions.pharmacist!)
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .send({ amountPaise: FEE_PAISE, method: 'cash', idempotencyKey: 'cp-pharmacist-should-fail' });
    expect(attempt.status).toBe(403);
    expect(attempt.body.error.code).toBe('FORBIDDEN');

    const invoice = await authed(sessions.cashier!).get(`/api/v1/invoices/${invoiceId}`);
    expect(invoice.status).toBe(200);
    expect(invoice.body.payments.length).toBe(0);
    expect(invoice.body.balancePaise).toBe(FEE_PAISE);
  });

  test('cash settles the invoice: status paid, balance zero, the payment on the ledger', async ({ skip }) => {
    if (!ready) return skip();
    const paid = await authed(sessions.cashier!)
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .send({ amountPaise: FEE_PAISE, method: 'cash', idempotencyKey: 'cp-consultation-fee' });
    expect(paid.status).toBe(201);
    expect(paid.body.status).toBe('paid');
    expect(paid.body.amountPaidPaise).toBe(FEE_PAISE);
    expect(paid.body.balancePaise).toBe(0);
    expect(paid.body.payments.length).toBe(1);
    expect(paid.body.payments[0].method).toBe('cash');
    expect(paid.body.payments[0].amountPaise).toBe(FEE_PAISE);
    expect(paid.body.payments[0].status).toBe('captured');

    // Re-read as the cashier: the settlement is persisted, not just the write's return value.
    const reread = await authed(sessions.cashier!).get(`/api/v1/invoices/${invoiceId}`);
    expect(reread.body.status).toBe('paid');
    expect(reread.body.balancePaise).toBe(0);
    expect(reread.body.lineItems.length).toBe(1);
    expect(reread.body.lineItems[0].itemType).toBe('consultation');
    expect(reread.body.lineItems[0].lineTotalPaise).toBe(FEE_PAISE);
  });
});

describe('5 — the doctor consults', () => {
  test('the paid visit advances and the encounter opens as a draft on the right patient', async ({ skip }) => {
    if (!ready) return skip();
    const advanced = await authed(sessions.doctor!).patch(`/api/v1/visits/${visitId}/status`).send({ status: 'in_consultation' });
    expect(advanced.status).toBe(200);
    expect(advanced.body.status).toBe('in_consultation');

    const opened = await authed(sessions.doctor!).post('/api/v1/encounters/open').send({ visitId });
    expect(opened.status).toBe(200);
    expect(opened.body.status).toBe('draft');
    expect(opened.body.visitId).toBe(visitId);
    expect(opened.body.patientId).toBe(patientId);
    expect(opened.body.providerId).toBe(providerId);
    encounterId = opened.body.id;
    encounterVersion = opened.body.version;
  });

  test('SOAP, vitals, a prescription and a lab order save together — masters snapshot server-side', async ({ skip }) => {
    if (!ready) return skip();
    const saved = await authed(sessions.doctor!)
      .put(`/api/v1/encounters/${encounterId}`)
      .send({
        version: encounterVersion,
        chiefComplaint: 'Fever four days',
        subjective: 'Intermittent fever, generalised weakness. No cough.',
        objective: 'Febrile, chest clear, no organomegaly.',
        assessment: 'Undifferentiated febrile illness; rule out anaemia.',
        plan: 'Antibiotic course, haemoglobin today, review in 48 hours.',
        vitals: { systolic: 118, diastolic: 76, pulse: 96, spo2: 98, tempC: 38.4, weightKg: 62.5, heightCm: 158 },
        diagnoses: [{ icd10Code: 'R50.9', icd10Term: 'Fever, unspecified', isPrimary: true }],
        // The client sends a deliberately wrong display name for both master-linked rows.
        prescriptions: [
          { drugId, drugName: 'whatever the client typed', dose: '500 mg', frequency: '1-0-1', duration: '5 days', route: 'oral' },
        ],
        labOrders: [{ testId: labTestId, testName: 'typed by hand', priority: 'urgent' }],
      });
    expect(saved.status).toBe(200);
    encounterVersion = saved.body.version;
    expect(encounterVersion).toBeGreaterThan(0);

    expect(saved.body.chiefComplaint).toBe('Fever four days');
    expect(saved.body.vitals.tempC).toBe(38.4); // stored in tenths, converted back at the edge
    expect(saved.body.vitals.weightKg).toBe(62.5); // stored in grams
    expect(saved.body.vitals.pulse).toBe(96);
    expect(saved.body.diagnoses.length).toBe(1);
    expect(saved.body.diagnoses[0].icd10Code).toBe('R50.9');
    expect(saved.body.diagnoses[0].isPrimary).toBe(true);

    // The master's name wins over whatever the client typed — the snapshot is server-side.
    expect(saved.body.prescriptions.length).toBe(1);
    expect(saved.body.prescriptions[0].drugId).toBe(drugId);
    expect(saved.body.prescriptions[0].drugName).toBe('Amoxicillin 500 mg');
    expect(saved.body.prescriptions[0].dose).toBe('500 mg');
    expect(saved.body.prescriptions[0].status).toBe('ordered');
    prescriptionId = saved.body.prescriptions[0].id;

    expect(saved.body.labOrders.length).toBe(1);
    expect(saved.body.labOrders[0].testId).toBe(labTestId);
    expect(saved.body.labOrders[0].testName).toBe('Haemoglobin');
    expect(saved.body.labOrders[0].testCode).toBe('HB');
    expect(saved.body.labOrders[0].priority).toBe('urgent');
    expect(saved.body.labOrders[0].status).toBe('ordered');
    labOrderId = saved.body.labOrders[0].id;
  });

  test('an unsigned prescription is invisible to the pharmacy and cannot be dispensed', async ({ skip }) => {
    if (!ready) return skip();
    const pending = await authed(sessions.pharmacist!).get('/api/v1/prescriptions/pending');
    expect(pending.status).toBe(200);
    expect(pending.body.length).toBe(0);

    // Not merely hidden — the API refuses a direct call that skips the worklist entirely.
    const attempt = await authed(sessions.pharmacist!)
      .post('/api/v1/dispense')
      .send({ prescriptionId, drugId, quantity: 1 });
    expect(attempt.status).toBe(409);
    expect(attempt.body.error.message).toMatch(/not signed/i);
  });
});

describe('6 — the doctor signs, and the chart locks', () => {
  test('a receptionist cannot sign a chart, and the encounter stays a draft', async ({ skip }) => {
    if (!ready) return skip();
    const attempt = await authed(sessions.receptionist!).post(`/api/v1/encounters/${encounterId}/sign`);
    expect(attempt.status).toBe(403);
    expect(attempt.body.error.code).toBe('FORBIDDEN');

    const chart = await authed(sessions.doctor!).get(`/api/v1/encounters/${encounterId}`);
    expect(chart.body.status).toBe('draft');
    expect(chart.body.signedAt).toBeNull();
  });

  test('signing locks the encounter, completes the visit, and refuses every further edit', async ({ skip }) => {
    if (!ready) return skip();
    const signed = await authed(sessions.doctor!).post(`/api/v1/encounters/${encounterId}/sign`);
    expect(signed.status).toBe(200);
    expect(signed.body.status).toBe('signed');
    expect(signed.body.signedAt).toBeTruthy();
    encounterVersion = signed.body.version;

    const visit = await authed(sessions.doctor!).get(`/api/v1/visits/${visitId}`);
    expect(visit.body.status).toBe('completed');
    expect(visit.body.completedAt).toBeTruthy();

    // A later save is refused — and the note it tried to overwrite is unchanged.
    const edit = await authed(sessions.doctor!)
      .put(`/api/v1/encounters/${encounterId}`)
      .send({ version: encounterVersion, chiefComplaint: 'rewritten after signing', diagnoses: [], prescriptions: [], labOrders: [] });
    expect(edit.status).toBe(409);
    expect(edit.body.error.message).toMatch(/signed/i);

    const reread = await authed(sessions.doctor!).get(`/api/v1/encounters/${encounterId}`);
    expect(reread.body.chiefComplaint).toBe('Fever four days');
    expect(reread.body.diagnoses.length).toBe(1);
    expect(reread.body.prescriptions.length).toBe(1);
  });
});

describe('7 — the pharmacist dispenses', () => {
  test('a cashier cannot dispense, and the stock does not move', async ({ skip }) => {
    if (!ready) return skip();
    const attempt = await authed(sessions.cashier!).post('/api/v1/dispense').send({ prescriptionId, drugId, quantity: DISPENSE_QTY });
    expect(attempt.status).toBe(403);
    expect(attempt.body.error.code).toBe('FORBIDDEN');

    const drugs = await authed(sessions.pharmacist!).get('/api/v1/drugs');
    expect(drugs.body.find((d: { id: string }) => d.id === drugId).onHand).toBe(100);
  });

  test('exactly that prescription is waiting, dispenses once, draws down stock and bills the visit', async ({ skip }) => {
    if (!ready) return skip();
    const pending = await authed(sessions.pharmacist!).get('/api/v1/prescriptions/pending');
    expect(pending.status).toBe(200);
    expect(pending.body.length).toBe(1);
    const waiting = pending.body[0];
    expect(waiting.id).toBe(prescriptionId);
    expect(waiting.drugId).toBe(drugId);
    expect(waiting.drugName).toBe('Amoxicillin 500 mg');
    expect(waiting.patientId).toBe(patientId);
    expect(waiting.patientUhid).toBe(patientUhid);
    expect(waiting.visitId).toBe(visitId);

    const before = (await authed(sessions.pharmacist!).get('/api/v1/drugs')).body.find((d: { id: string }) => d.id === drugId).onHand;

    const dispensed = await authed(sessions.pharmacist!)
      .post('/api/v1/dispense')
      .send({ prescriptionId, drugId, quantity: DISPENSE_QTY });
    expect(dispensed.status).toBe(201); // a dispense record is created, so 201 — not 200
    expect(dispensed.body.quantity).toBe(DISPENSE_QTY);
    expect(dispensed.body.totalPaise).toBe(PHARMACY_PAISE);
    expect(dispensed.body.invoiceId).toBe(invoiceId); // billed back onto the visit's own invoice

    const after = (await authed(sessions.pharmacist!).get('/api/v1/drugs')).body.find((d: { id: string }) => d.id === drugId).onHand;
    expect(before - after).toBe(DISPENSE_QTY);

    // Dispensed, so it leaves the worklist — the queue is state, not a to-do list.
    const afterPending = await authed(sessions.pharmacist!).get('/api/v1/prescriptions/pending');
    expect(afterPending.body.length).toBe(0);
  });

  test('the pharmacy charge lands on the consultation invoice, and a second dispense is refused', async ({ skip }) => {
    if (!ready) return skip();
    const invoice = await authed(sessions.cashier!).get(`/api/v1/invoices/${invoiceId}`);
    const pharmacyLines = invoice.body.lineItems.filter((l: { itemType: string }) => l.itemType === 'pharmacy');
    expect(pharmacyLines.length).toBe(1);
    expect(pharmacyLines[0].quantity).toBe(DISPENSE_QTY);
    expect(pharmacyLines[0].lineTotalPaise).toBe(PHARMACY_PAISE);
    expect(pharmacyLines[0].description).toContain('Amoxicillin 500 mg');
    expect(invoice.body.totalPaise).toBe(FEE_PAISE + PHARMACY_PAISE);
    // The consultation is paid; only the new pharmacy charge is outstanding.
    expect(invoice.body.balancePaise).toBe(PHARMACY_PAISE);
    expect(invoice.body.status).toBe('partially_paid');

    const again = await authed(sessions.pharmacist!).post('/api/v1/dispense').send({ prescriptionId, drugId, quantity: 1 });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/already been dispensed/i);

    // The refused retry billed nothing and took no further stock.
    const afterRetry = await authed(sessions.cashier!).get(`/api/v1/invoices/${invoiceId}`);
    expect(afterRetry.body.lineItems.filter((l: { itemType: string }) => l.itemType === 'pharmacy').length).toBe(1);
    expect(afterRetry.body.totalPaise).toBe(FEE_PAISE + PHARMACY_PAISE);
    const onHand = (await authed(sessions.pharmacist!).get('/api/v1/drugs')).body.find((d: { id: string }) => d.id === drugId).onHand;
    expect(onHand).toBe(100 - DISPENSE_QTY);
  });
});

describe('8 — the lab technician collects and results', () => {
  test('the doctor may read the order but not collect the sample, and the order stays ordered', async ({ skip }) => {
    if (!ready) return skip();
    const read = await authed(sessions.doctor!).get(`/api/v1/lab-orders/${labOrderId}`);
    expect(read.status).toBe(200);
    expect(read.body.status).toBe('ordered');

    const attempt = await authed(sessions.doctor!).post(`/api/v1/lab-orders/${labOrderId}/collect`);
    expect(attempt.status).toBe(403);
    expect(attempt.body.error.code).toBe('FORBIDDEN');

    const afterwards = await authed(sessions.lab_technician!).get(`/api/v1/lab-orders/${labOrderId}`);
    expect(afterwards.body.status).toBe('ordered');
  });

  test('the order is on the technician’s worklist, and collection bills the test once', async ({ skip }) => {
    if (!ready) return skip();
    const worklist = await authed(sessions.lab_technician!).get('/api/v1/lab-orders');
    expect(worklist.status).toBe(200);
    expect(worklist.body.length).toBe(1);
    expect(worklist.body[0].id).toBe(labOrderId);
    expect(worklist.body[0].testName).toBe('Haemoglobin');
    expect(worklist.body[0].patientUhid).toBe(patientUhid);
    expect(worklist.body[0].visitId).toBe(visitId);
    expect(worklist.body[0].result).toBeNull();

    const collected = await authed(sessions.lab_technician!).post(`/api/v1/lab-orders/${labOrderId}/collect`);
    expect(collected.status).toBe(200);
    expect(collected.body.status).toBe('collected');

    // Priced at collection from the test master, so the counter can settle before testing.
    const invoice = await authed(sessions.cashier!).get(`/api/v1/invoices/${invoiceId}`);
    const labLines = invoice.body.lineItems.filter((l: { itemType: string }) => l.itemType === 'lab');
    expect(labLines.length).toBe(1);
    expect(labLines[0].lineTotalPaise).toBe(LAB_PRICE_PAISE);
    expect(labLines[0].description).toContain('Haemoglobin');
    expect(invoice.body.totalPaise).toBe(FEE_PAISE + PHARMACY_PAISE + LAB_PRICE_PAISE);

    const twice = await authed(sessions.lab_technician!).post(`/api/v1/lab-orders/${labOrderId}/collect`);
    expect(twice.status).toBe(409);
  });

  test('the result is entered, flagged against the master’s reference range, and billed only once', async ({ skip }) => {
    if (!ready) return skip();
    const resulted = await authed(sessions.lab_technician!).post(`/api/v1/lab-orders/${labOrderId}/result`).send({ value: '9.4' });
    expect(resulted.status).toBe(200);
    expect(resulted.body.status).toBe('resulted');
    expect(resulted.body.result.value).toBe('9.4');
    // 9.4 < refLow 12 — the flag and the units come from the linked master, not the client.
    expect(resulted.body.result.flag).toBe('low');
    expect(resulted.body.result.unit).toBe('g/dL');
    expect(resulted.body.result.refLow).toBe('12');
    expect(resulted.body.result.verifiedAt).toBeNull(); // entering is not verifying

    const invoice = await authed(sessions.cashier!).get(`/api/v1/invoices/${invoiceId}`);
    expect(invoice.body.lineItems.filter((l: { itemType: string }) => l.itemType === 'lab').length).toBe(1);
    expect(invoice.body.totalPaise).toBe(FEE_PAISE + PHARMACY_PAISE + LAB_PRICE_PAISE);
  });
});

describe('9 — everything the encounter produced hangs off the same patient and visit', () => {
  test('encounter, prescription, lab order and invoice all point at the one patient and the one visit', async ({ skip }) => {
    if (!ready) return skip();
    const encounter = await authed(sessions.doctor!).get(`/api/v1/encounters/${encounterId}`);
    expect(encounter.body.patientId).toBe(patientId);
    expect(encounter.body.visitId).toBe(visitId);
    expect(encounter.body.patientUhid).toBe(patientUhid);
    expect(encounter.body.prescriptions[0].id).toBe(prescriptionId);
    expect(encounter.body.prescriptions[0].status).toBe('dispensed'); // pharmacy moved it, in place
    expect(encounter.body.labOrders[0].id).toBe(labOrderId);
    expect(encounter.body.labOrders[0].status).toBe('resulted');

    const labOrder = await authed(sessions.lab_technician!).get(`/api/v1/lab-orders/${labOrderId}`);
    expect(labOrder.body.patientId).toBe(patientId);
    expect(labOrder.body.visitId).toBe(visitId);

    const invoice = await authed(sessions.cashier!).get(`/api/v1/invoices/${invoiceId}`);
    expect(invoice.body.patientId).toBe(patientId);
    expect(invoice.body.visitId).toBe(visitId);
    expect(invoice.body.patientUhid).toBe(patientUhid);

    const visit = await authed(sessions.cashier!).get(`/api/v1/visits/${visitId}`);
    expect(visit.body.invoice.id).toBe(invoiceId);
    expect(visit.body.patientId).toBe(patientId);
  });

  test('the visit is one bill, not three: every charge is on the same invoice', async ({ skip }) => {
    if (!ready) return skip();
    const list = await authed(sessions.cashier!).get(`/api/v1/invoices?patientId=${patientId}`);
    expect(list.status).toBe(200);
    expect(list.body.page.total).toBe(1);
    expect(list.body.data[0].id).toBe(invoiceId);
    for (const row of list.body.data) expect(row.patientId).toBe(patientId);

    const invoice = await authed(sessions.cashier!).get(`/api/v1/invoices/${invoiceId}`);
    expect(invoice.body.lineItems.map((l: { itemType: string }) => l.itemType).sort()).toEqual(['consultation', 'lab', 'pharmacy']);
  });

  test('the signed consultation is now the patient’s clinical history', async ({ skip }) => {
    if (!ready) return skip();
    const history = await authed(sessions.doctor!).get(`/api/v1/patients/${patientId}/encounters`);
    expect(history.status).toBe(200);
    expect(history.body.length).toBe(1);
    expect(history.body[0].id).toBe(encounterId);
    expect(history.body[0].visitId).toBe(visitId);
    expect(history.body[0].chiefComplaint).toBe('Fever four days');
    expect(history.body[0].diagnoses[0].icd10Code).toBe('R50.9');
    expect(history.body[0].prescriptionCount).toBe(1);
    expect(history.body[0].labOrderCount).toBe(1);
    expect(history.body[0].signedAt).toBeTruthy();
  });

  test('the cashier settles the remaining pharmacy and lab charges and the visit closes at zero', async ({ skip }) => {
    if (!ready) return skip();
    const due = PHARMACY_PAISE + LAB_PRICE_PAISE;
    const settled = await authed(sessions.cashier!)
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .send({ amountPaise: due, method: 'upi', reference: 'UPI-CP-0001', idempotencyKey: 'cp-final-settlement' });
    expect(settled.status).toBe(201);
    expect(settled.body.status).toBe('paid');
    expect(settled.body.balancePaise).toBe(0);
    expect(settled.body.amountPaidPaise).toBe(FEE_PAISE + due);
    expect(settled.body.payments.length).toBe(2);
    expect(settled.body.payments.map((p: { method: string }) => p.method)).toEqual(['cash', 'upi']);

    // Nothing further can be collected against a settled bill.
    const extra = await authed(sessions.cashier!)
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .send({ amountPaise: 100, method: 'cash', idempotencyKey: 'cp-overcollect' });
    expect(extra.status).toBe(409);
    expect(extra.body.error.message).toMatch(/settled/i);
  });
});
