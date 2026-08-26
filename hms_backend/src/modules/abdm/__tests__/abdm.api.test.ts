import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { api, authed, cleanupTenant, dbReady, login, makeTenant, type Session } from '../../../test-api';
import { grantModule } from '../../entitlement/entitlement.service';

/**
 * ABDM Milestone 1 at the HTTP boundary (ADR-084).
 *
 * The service suite proves the rules; this one proves the boundary that protects them — the
 * Bearer check, `requireModule('abdm')`, `requirePermission`, Zod validation, and the one
 * unauthenticated route ABDM adds. A frontend guard is UX; this is where the boundary is.
 */

const CODE = 'ABDMAPI';
/** A hospital that is NOT entitled to the module — the 403-before-anything-else case. */
const UNENTITLED_CODE = 'ABDMNOENT';
const BASE = '/api/v1';

let ready = false;
let receptionist: Session;
let doctor: Session;
let orgAdmin: Session;
let unentitled: Session;

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) return;
  await cleanupTenant(CODE);
  await cleanupTenant(UNENTITLED_CODE);

  const tenant = await makeTenant(CODE);
  await grantModule(tenant.tenantId, 'patient');
  await grantModule(tenant.tenantId, 'abdm');
  receptionist = await login(CODE, tenant.users.receptionist);
  doctor = await login(CODE, tenant.users.doctor);
  orgAdmin = await login(CODE, tenant.users.org_admin);

  const other = await makeTenant(UNENTITLED_CODE);
  await grantModule(other.tenantId, 'patient');
  unentitled = await login(UNENTITLED_CODE, other.users.receptionist);
});

afterAll(async () => {
  if (!ready) return;
  await cleanupTenant(CODE);
  await cleanupTenant(UNENTITLED_CODE);
});

describe('the authorization chain', () => {
  test('no token is 401', async ({ skip }) => {
    if (!ready) return skip();
    const res = await api().get(`${BASE}/abdm/capabilities`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('a hospital without the module is refused before any permission is considered', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(unentitled).get(`${BASE}/abdm/capabilities`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MODULE_NOT_ENTITLED');
  });

  test('a role without the permission is refused', async ({ skip }) => {
    if (!ready) return skip();
    // A doctor works the chart; verifying an ABHA at the counter is not their action.
    const res = await authed(doctor).get(`${BASE}/abdm/capabilities`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('the front desk may verify', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(receptionist).get(`${BASE}/abdm/capabilities`);
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('mock');
    expect(res.body.scanShareEnabled).toBe(false); // no facility registered yet
  });

  test('configuring the facility is an administrator action, not a counter one', async ({ skip }) => {
    if (!ready) return skip();
    const refused = await authed(receptionist).put(`${BASE}/abdm/facility`).send({ hipId: 'HFR-NOPE' });
    expect(refused.status).toBe(403);

    const allowed = await authed(orgAdmin)
      .put(`${BASE}/abdm/facility`)
      .send({ hipId: 'HFR-ABDMAPI-001', facilityName: 'API Test Hospital', qrContent: 'https://qr.example/abdmapi', scanShareEnabled: true });
    expect(allowed.status).toBe(200);
    expect(allowed.body.hipId).toBe('HFR-ABDMAPI-001');
  });
});

describe('validation at the boundary', () => {
  test('consent is a required true, not an omittable flag', async ({ skip }) => {
    if (!ready) return skip();
    const missing = await authed(receptionist).post(`${BASE}/abdm/enrolment/aadhaar/otp`).send({ aadhaar: '111122223333' });
    expect(missing.status).toBe(422);

    const explicitFalse = await authed(receptionist)
      .post(`${BASE}/abdm/enrolment/aadhaar/otp`)
      .send({ aadhaar: '111122223333', consentGiven: false });
    expect(explicitFalse.status).toBe(422);
  });

  test('a malformed Aadhaar is refused without reaching ABDM', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(receptionist).post(`${BASE}/abdm/enrolment/aadhaar/otp`).send({ aadhaar: '123', consentGiven: true });
    expect(res.status).toBe(422);
  });

  test('the error body never echoes the Aadhaar back', async ({ skip }) => {
    if (!ready) return skip();
    const aadhaar = '111122223331'; // the mock's "no mobile linked to this Aadhaar" scenario
    const res = await authed(receptionist).post(`${BASE}/abdm/enrolment/aadhaar/otp`).send({ aadhaar, consentGiven: true });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.body)).not.toContain(aadhaar);
  });
});

describe('the Aadhaar flow over HTTP', () => {
  test('OTP, verify, prefill', async ({ skip }) => {
    if (!ready) return skip();
    const started = await authed(receptionist)
      .post(`${BASE}/abdm/enrolment/aadhaar/otp`)
      .send({ aadhaar: '888899990002', consentGiven: true });
    expect(started.status).toBe(202);
    expect(started.body.transactionId).toBeTruthy();
    // Sandbox and mock return the OTP in-band because no SMS is sent.
    expect(started.body.devOtp).toBe('123456');

    const verified = await authed(receptionist)
      .post(`${BASE}/abdm/enrolment/aadhaar/verify`)
      .send({ transactionId: started.body.transactionId, otp: started.body.devOtp });
    expect(verified.status).toBe(200);
    expect(verified.body.prefill.firstName).toBeTruthy();
    expect(verified.body.match.outcome).toBe('new');
    // No ABDM token ever reaches a browser.
    expect(JSON.stringify(verified.body)).not.toContain('mock-link-');
    expect(JSON.stringify(verified.body)).not.toContain('mock-x-');
  });

  test('registering, then linking the verified ABHA to the new chart', async ({ skip }) => {
    if (!ready) return skip();
    const started = await authed(receptionist)
      .post(`${BASE}/abdm/enrolment/aadhaar/otp`)
      .send({ aadhaar: '888899990003', consentGiven: true });
    const verified = await authed(receptionist)
      .post(`${BASE}/abdm/enrolment/aadhaar/verify`)
      .send({ transactionId: started.body.transactionId, otp: '123456' });

    const patient = await authed(receptionist)
      .post(`${BASE}/patients`)
      .send({ ...verified.body.prefill, abhaAddress: undefined, phone: '9444400001' });
    expect(patient.status).toBe(201);
    // The chart exists with the number typed in, but nothing has proved it yet.
    expect(patient.body.abhaVerifiedAt).toBeNull();

    const linked = await authed(receptionist)
      .post(`${BASE}/abdm/link`)
      .send({ transactionId: verified.body.transactionId, patientId: patient.body.id });
    expect(linked.status).toBe(200);
    expect(linked.body.abhaVerifiedAt).toBeTruthy();
  });
});

describe('correcting the profile at ABDM', () => {
  test('the front desk may not amend the national register by default', async ({ skip }) => {
    if (!ready) return skip();
    // Verifying an identity and amending the identity register are different acts. A hospital
    // that wants its desk to do the second one grants the key deliberately.
    const res = await authed(receptionist)
      .patch(`${BASE}/abdm/profile`)
      .send({ transactionId: '00000000-0000-0000-0000-000000000000', lastName: 'Nope' });
    expect(res.status).toBe(403);
  });

  test('an administrator can, and an empty patch is refused', async ({ skip }) => {
    if (!ready) return skip();
    const started = await authed(receptionist)
      .post(`${BASE}/abdm/enrolment/aadhaar/otp`)
      .send({ aadhaar: '888899990004', consentGiven: true });
    const verified = await authed(receptionist)
      .post(`${BASE}/abdm/enrolment/aadhaar/verify`)
      .send({ transactionId: started.body.transactionId, otp: '123456' });

    const empty = await authed(orgAdmin).patch(`${BASE}/abdm/profile`).send({ transactionId: verified.body.transactionId });
    expect(empty.status).toBe(422);

    const ok = await authed(orgAdmin)
      .patch(`${BASE}/abdm/profile`)
      .send({ transactionId: verified.body.transactionId, lastName: 'Amended', gender: 'F' });
    expect(ok.status).toBe(200);
    expect(ok.body.prefill.lastName).toBe('Amended');
  });

  test('a malformed field is refused before ABDM is called', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(orgAdmin)
      .patch(`${BASE}/abdm/profile`)
      .send({ transactionId: '00000000-0000-0000-0000-000000000000', pincode: 'abc', dateOfBirth: '1990-01-01' });
    expect(res.status).toBe(422);
  });
});

describe('the Scan-and-Share callback', () => {
  /** The path NHA appends to the registered bridge URL — not one of ours (ADR-084). */
  const path = '/api/v3/hip/patient/share';

  /** The payload shape from the official V3 collection: nested, with a masked date of birth. */
  const share = (hipId: string, name: string, extra: Record<string, unknown> = {}) => ({
    intent: 'PROFILE_SHARE',
    metaData: { hipId, context: '1', hprId: 'testhpr@hpr.abdm' },
    profile: {
      patient: {
        abhaNumber: '11-2222-3333-4444',
        abhaAddress: `${name.toLowerCase()}@sbx`,
        name,
        gender: 'F',
        dayOfBirth: '1*',
        monthOfBirth: '0*',
        yearOfBirth: '1994',
        address: { line: '12 MG Road', district: null, state: null, pinCode: null },
        phoneNumber: '9812345678',
        ...extra,
      },
    },
  });

  test('accepts an unauthenticated push for a registered facility', async ({ skip }) => {
    if (!ready) return skip();
    const res = await api().post(path).send(share('HFR-ABDMAPI-001', 'Priya Sharma'));
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true });

    // It arrives at that hospital's desk, and only there.
    const pending = await authed(receptionist).get(`${BASE}/abdm/pending-shares`);
    expect(pending.status).toBe(200);
    const mine = pending.body.find((s: { prefill: { firstName?: string } }) => s.prefill.firstName === 'Priya');
    expect(mine).toBeTruthy();
    // The name is split on the first space; the remainder stays with the surname.
    expect(mine.prefill.lastName).toBe('Sharma');
    // A masked day and month still yield a usable date — the birth YEAR is what the match needs.
    expect(mine.prefill.dateOfBirth).toBe('1994-01-01');
    expect(mine.prefill.addressLine).toBe('12 MG Road');
  });

  test('the X-HIP-ID header also identifies the facility', async ({ skip }) => {
    if (!ready) return skip();
    const body = share('HFR-ABDMAPI-001', 'Arjun Mehta');
    delete (body.metaData as { hipId?: string }).hipId;
    const res = await api().post(path).set('X-HIP-ID', 'HFR-ABDMAPI-001').send(body);
    expect(res.status).toBe(202);

    const pending = await authed(receptionist).get(`${BASE}/abdm/pending-shares`);
    expect(pending.body.some((s: { prefill: { firstName?: string } }) => s.prefill.firstName === 'Arjun')).toBe(true);
  });

  test('answers identically for a facility that does not exist', async ({ skip }) => {
    if (!ready) return skip();
    // Any difference here — status or body — would let an unauthenticated caller enumerate which
    // hospitals are on the platform (ADR-056).
    const res = await api().post(path).send(share('HFR-NOT-A-REAL-FACILITY', 'Nobody Here'));
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true });
  });

  test('no facility at all is still an indistinguishable 202', async ({ skip }) => {
    if (!ready) return skip();
    const body = share('x', 'Nobody Here');
    delete (body.metaData as { hipId?: string }).hipId;
    const res = await api().post(path).send(body);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true });
  });

  test('a malformed payload is refused', async ({ skip }) => {
    if (!ready) return skip();
    const res = await api().post(path).send({ nothing: true });
    expect(res.status).toBe(422);
  });

  test('another hospital never sees the shared profile', async ({ skip }) => {
    if (!ready) return skip();
    const theirs = await authed(unentitled).get(`${BASE}/abdm/pending-shares`);
    // Not entitled to the module at all — refused before the query would even run.
    expect(theirs.status).toBe(403);
  });
});
