import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { api, authed, cleanupTenant, dbReady, login, makeTenant, TEST_PASSWORD, type TestTenant } from '../../../test-api';

/**
 * Authentication over HTTP (testcases.md §1 AUTH-*, manual guide §1).
 *
 * `auth.test.ts` proves the primitives (hash, token round-trip). This proves the *endpoint*:
 * status codes, the uniform failure response that must not reveal whether an account exists,
 * Zod rejection of malformed bodies, the refresh cookie's flags and path scope, and that
 * `/auth/me` returns the caller's real role and tenant context rather than anything the
 * client asked for.
 */

const CODE = 'APIAUTH';
let ready = false;
let tenant: TestTenant;

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) {
    console.warn('[auth.api] skipping — no database');
    return;
  }
  await cleanupTenant(CODE);
  tenant = await makeTenant(CODE);
}, 60_000);

afterAll(async () => {
  if (ready) await cleanupTenant(CODE);
});

describe('POST /api/v1/auth/login', () => {
  test('valid credentials return an access token and the caller’s own tenant', async ({ skip }) => {
    if (!ready) return skip();
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ orgCode: CODE, email: tenant.users.doctor, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.accessToken.length).toBeGreaterThan(20);
    expect(res.body.user.email).toBe(tenant.users.doctor);
    // The tenant comes from the account, never from client input.
    expect(res.body.user.tenantId).toBe(tenant.tenantId);
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  test('the org code is matched case-insensitively', async ({ skip }) => {
    if (!ready) return skip();
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ orgCode: CODE.toLowerCase(), email: tenant.users.doctor, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
  });

  test('a wrong password is refused with 401', async ({ skip }) => {
    if (!ready) return skip();
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ orgCode: CODE, email: tenant.users.doctor, password: 'WrongPassword#1' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('an unknown email and an unknown org fail identically — no account enumeration', async ({ skip }) => {
    if (!ready) return skip();
    const unknownEmail = await api()
      .post('/api/v1/auth/login')
      .send({ orgCode: CODE, email: `nobody@${CODE.toLowerCase()}.test`, password: TEST_PASSWORD });
    const unknownOrg = await api()
      .post('/api/v1/auth/login')
      .send({ orgCode: 'NOSUCHORG', email: tenant.users.doctor, password: TEST_PASSWORD });

    expect(unknownEmail.status).toBe(401);
    expect(unknownOrg.status).toBe(401);
    // Same status AND same message, or the difference itself is the disclosure.
    expect(unknownOrg.body.error.message).toBe(unknownEmail.body.error.message);
  });

  test('a malformed body is rejected by validation, not by the service', async ({ skip }) => {
    if (!ready) return skip();
    const missing = await api().post('/api/v1/auth/login').send({ orgCode: CODE });
    const notAnEmail = await api()
      .post('/api/v1/auth/login')
      .send({ orgCode: CODE, email: 'not-an-email', password: TEST_PASSWORD });

    // 422 VALIDATION_ERROR is the platform's contract for a well-formed request whose
    // body fails the schema (http/error.ts), not 400.
    expect(missing.status).toBe(422);
    expect(notAnEmail.status).toBe(422);
    expect(missing.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('login sets an httpOnly refresh cookie scoped to the auth routes', async ({ skip }) => {
    if (!ready) return skip();
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ orgCode: CODE, email: tenant.users.doctor, password: TEST_PASSWORD });

    const cookies = res.headers['set-cookie'] as unknown as string[];
    const refresh = cookies.find((c) => c.startsWith('hms_refresh='));
    expect(refresh).toBeDefined();
    expect(refresh).toContain('HttpOnly');
    // Path scoping is what keeps the staff cookie off patient routes (ADR-052).
    expect(refresh).toContain('Path=/api/v1/auth');
    // The refresh token must never be readable from the JSON body.
    expect(JSON.stringify(res.body)).not.toContain('hms_refresh');
  });
});

describe('GET /api/v1/auth/me', () => {
  test('returns the signed-in user with the roles actually held', async ({ skip }) => {
    if (!ready) return skip();
    const session = await login(CODE, tenant.users.receptionist);
    const res = await authed(session).get('/api/v1/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(tenant.users.receptionist);
    expect(res.body.user.tenantId).toBe(tenant.tenantId);
    expect(res.body.user.roles).toContain('receptionist');
    expect(res.body.user.roles).not.toContain('doctor');
  });

  test('no token, a malformed header, and a forged token are all 401', async ({ skip }) => {
    if (!ready) return skip();
    const none = await api().get('/api/v1/auth/me');
    const malformed = await api().get('/api/v1/auth/me').set('Authorization', 'Bearer');
    const forged = await api().get('/api/v1/auth/me').set('Authorization', 'Bearer not.a.real.token');

    expect(none.status).toBe(401);
    expect(malformed.status).toBe(401);
    expect(forged.status).toBe(401);
  });
});

describe('unknown routes', () => {
  test('return the canonical error shape, never a blank body', async ({ skip }) => {
    if (!ready) return skip();
    const res = await api().get('/api/v1/definitely-not-a-route');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBeDefined();
  });
});
