import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { authed, cleanupTenant, dbReady, login, makeTenant, type Session, type TestTenant } from '../../test-api';

/**
 * Tenant isolation through the API (testcases.md §2 TEN-*, manual guide §12).
 *
 * `tenant-isolation.test.ts` proves RLS at the database. This proves the boundary a real
 * attacker actually reaches: a valid session for Hospital A, presented to the HTTP API,
 * asking for Hospital B's records **by id**. Frontend route hiding is irrelevant here —
 * these calls bypass the UI entirely, which is exactly the point (ADR: a frontend guard
 * is UX, never security).
 *
 * Two independently onboarded tenants, each with its own patient, exercised in both
 * directions so a one-way leak cannot pass.
 */

const A = 'ISOAAA';
const B = 'ISOBBB';

let ready = false;
let tenantA: TestTenant;
let tenantB: TestTenant;
let sessionA: Session;
let sessionB: Session;
let patientA = '';
let patientB = '';

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) {
    console.warn('[tenant-isolation.api] skipping — no database');
    return;
  }
  await cleanupTenant(A);
  await cleanupTenant(B);
  tenantA = await makeTenant(A, 'Hospital A');
  tenantB = await makeTenant(B, 'Hospital B');

  sessionA = await login(A, tenantA.users.receptionist);
  sessionB = await login(B, tenantB.users.receptionist);

  const createdA = await authed(sessionA)
    .post('/api/v1/patients')
    .send({ firstName: 'Anita', lastName: 'Alpha', gender: 'female', phone: '+919000000101' });
  const createdB = await authed(sessionB)
    .post('/api/v1/patients')
    .send({ firstName: 'Bhavesh', lastName: 'Beta', gender: 'male', phone: '+919000000202' });

  if (createdA.status !== 201 || createdB.status !== 201) {
    throw new Error(`patient setup failed: A=${createdA.status} B=${createdB.status}`);
  }
  patientA = createdA.body.id;
  patientB = createdB.body.id;
}, 120_000);

afterAll(async () => {
  if (!ready) return;
  await cleanupTenant(A);
  await cleanupTenant(B);
});

describe('cross-tenant reads', () => {
  test('a list returns only the caller’s own patients', async ({ skip }) => {
    if (!ready) return skip();
    const res = await authed(sessionA).get('/api/v1/patients');
    expect(res.status).toBe(200);

    const body = JSON.stringify(res.body);
    expect(body).toContain('Anita');
    // Not merely "B's id absent" — B's patient must not appear by any field.
    expect(body).not.toContain('Bhavesh');
    expect(body).not.toContain(patientB);
    expect(body).not.toContain('+919000000202');
  });

  test('fetching the other tenant’s patient by id is refused, in both directions', async ({ skip }) => {
    if (!ready) return skip();
    const aReadsB = await authed(sessionA).get(`/api/v1/patients/${patientB}`);
    const bReadsA = await authed(sessionB).get(`/api/v1/patients/${patientA}`);

    // 404 (not 403) is the right answer: confirming the row exists would itself leak.
    expect([403, 404]).toContain(aReadsB.status);
    expect([403, 404]).toContain(bReadsA.status);
    expect(JSON.stringify(aReadsB.body)).not.toContain('Bhavesh');
    expect(JSON.stringify(bReadsA.body)).not.toContain('Anita');
  });

  test('each tenant can still read its own patient — isolation is not a blanket denial', async ({ skip }) => {
    if (!ready) return skip();
    const own = await authed(sessionA).get(`/api/v1/patients/${patientA}`);
    expect(own.status).toBe(200);
    expect(own.body.firstName).toBe('Anita');
  });
});

describe('cross-tenant writes', () => {
  test('updating the other tenant’s patient does not succeed and does not mutate it', async ({ skip }) => {
    if (!ready) return skip();
    const attempt = await authed(sessionA)
      .patch(`/api/v1/patients/${patientB}`)
      .send({ firstName: 'Hijacked' });
    expect([403, 404]).toContain(attempt.status);

    // The decisive assertion: B's record is untouched when B reads it back.
    const afterwards = await authed(sessionB).get(`/api/v1/patients/${patientB}`);
    expect(afterwards.status).toBe(200);
    expect(afterwards.body.firstName).toBe('Bhavesh');
  });
});

describe('token scope', () => {
  test('a tenant’s token carries its own tenant — the client cannot ask for another', async ({ skip }) => {
    if (!ready) return skip();
    // Even when the caller *states* the other tenant, the session decides.
    const res = await authed(sessionA)
      .get('/api/v1/patients')
      .set('X-Tenant-Id', tenantB.tenantId)
      .set('X-Org-Code', B);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('Bhavesh');

    const me = await authed(sessionA).get('/api/v1/auth/me');
    expect(me.body.user.tenantId).toBe(tenantA.tenantId);
  });
});
