import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { writeAudit, listAudit } from '../audit.service';

// Verifies the audit trail is written/read correctly and is append-only (UPDATE/DELETE blocked by
// the DB trigger — tamper-evident even against a superuser). Skips cleanly if no DB is reachable.

const CODE = 'AUDITTEST';
let ready = false;
let tenantId = '';

async function cleanup(): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [CODE])).rows[0];
  if (!t) return;
  // The append-only trigger blocks DELETE — disable it (superuser) only to clean up test rows.
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
      await pool.query('INSERT INTO tenants (name, code) VALUES ($1,$2) RETURNING id', ['Audit Test', CODE])
    ).rows[0].id;
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[audit] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  if (ready) await cleanup();
});

describe('audit log', () => {
  test('writeAudit records an entry retrievable via listAudit', async ({ skip }) => {
    if (!ready) return skip();
    await writeAudit({
      tenantId,
      action: 'test.event',
      resourceType: 'thing',
      resourceId: 'abc',
      severity: 'notice',
    });
    const { rows, total } = await listAudit(tenantId, { page: 1, pageSize: 10 });
    expect(total).toBeGreaterThanOrEqual(1);
    expect(rows.some((r) => r.action === 'test.event' && r.resourceId === 'abc')).toBe(true);
  });

  test('a date window over created_at drives the end-of-day report', async ({ skip }) => {
    if (!ready) return skip();
    const toISO = (d: Date): string => d.toISOString().slice(0, 10);
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);

    // Today's window includes the entry written above; a future-only or past-only window excludes it.
    const todayWin = await listAudit(tenantId, { page: 1, pageSize: 10, from: toISO(now), to: toISO(now) });
    expect(todayWin.rows.some((r) => r.action === 'test.event')).toBe(true);
    expect((await listAudit(tenantId, { page: 1, pageSize: 10, from: toISO(tomorrow) })).total).toBe(0);
    expect((await listAudit(tenantId, { page: 1, pageSize: 10, to: toISO(yesterday) })).total).toBe(0);
  });

  test('audit_log is append-only: UPDATE and DELETE are blocked at the DB', async ({ skip }) => {
    if (!ready) return skip();
    const id = (await pool.query('SELECT id FROM audit_log WHERE tenant_id = $1 LIMIT 1', [tenantId]))
      .rows[0].id;
    await expect(
      pool.query('UPDATE audit_log SET action = $1 WHERE id = $2', ['tampered', id]),
    ).rejects.toThrow(/append-only/);
    await expect(pool.query('DELETE FROM audit_log WHERE id = $1', [id])).rejects.toThrow(
      /append-only/,
    );
  });
});
