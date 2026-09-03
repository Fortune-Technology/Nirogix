import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  api,
  authed,
  cleanupTenant,
  dbReady,
  login,
  makeTenant,
  type TestTenant,
} from '../../../test-api';
import { pool } from '../../../db/client';
import { resolveRequestId } from '../../../http/requestContext';

/**
 * Request correlation (ADR-082, SECURITY-AUDIT.md L-3).
 *
 * The audit trail recorded method and path but nothing that tied a row to the log lines or
 * the error-tracker event for the same request. These assert the id exists, comes back to the
 * caller, reaches the audit row, and cannot be poisoned by whatever a client puts in the header.
 */

const CODE = 'APIREQID';
let ready = false;
let tenant: TestTenant;

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) {
    console.warn('[requestId.api] skipping — no database');
    return;
  }
  await cleanupTenant(CODE);
  tenant = await makeTenant(CODE);
}, 60_000);

afterAll(async () => {
  if (ready) await cleanupTenant(CODE);
});

describe('request correlation id', () => {
  test('every response carries an X-Request-Id', async ({ skip }) => {
    if (!ready) return skip();
    const res = await api().get('/api/v1/health');
    expect(res.headers['x-request-id']).toMatch(/^[A-Za-z0-9._-]{8,64}$/);
  });

  test('two requests get different ids', async ({ skip }) => {
    if (!ready) return skip();
    const a = await api().get('/api/v1/health');
    const b = await api().get('/api/v1/health');
    expect(a.headers['x-request-id']).not.toBe(b.headers['x-request-id']);
  });

  test('a caller-supplied id is honoured when it is plainly an id, and replaced when it is not', () => {
    expect(resolveRequestId('trace-0123456789')).toBe('trace-0123456789');
    // Anything that could poison a log line or an audit row is replaced, not sanitised.
    expect(resolveRequestId('short')).not.toBe('short');
    expect(resolveRequestId('bad id with spaces')).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId('a'.repeat(200))).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId({ nope: true })).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('the id on the response is the id stored on the audit row for that request', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const session = await login(CODE, tenant.adminEmail);
    const res = await authed(session)
      .post('/api/v1/branches')
      .send({ name: 'Correlation Branch', code: 'CORR1' });
    expect([200, 201]).toContain(res.status);

    const requestId = res.headers['x-request-id'];
    expect(requestId).toBeDefined();

    // The audit middleware writes after the response is flushed, so poll briefly.
    let rows: Array<{ action: string }> = [];
    for (let i = 0; i < 20 && rows.length === 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const q = await pool.query(
        'SELECT action FROM audit_log WHERE tenant_id = $1 AND request_id = $2',
        [tenant.tenantId, requestId],
      );
      rows = q.rows;
    }
    expect(rows.length).toBeGreaterThan(0);
  });
});
