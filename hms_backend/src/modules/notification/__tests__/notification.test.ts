import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { renderTemplate, sendEmail, listNotifications } from '../notification.service';

// Exercises template rendering, the log provider, notification logging, and idempotency. The DB-
// backed cases skip cleanly if no DB is reachable; renderTemplate is pure and always runs.

const CODE = 'NOTIFTEST';
let ready = false;
let tenantId = '';

async function cleanup(): Promise<void> {
  const t = (await pool.query('SELECT id FROM tenants WHERE code = $1', [CODE])).rows[0];
  if (!t) return;
  await pool.query('DELETE FROM notification_log WHERE tenant_id = $1', [t.id]);
  await pool.query('DELETE FROM tenants WHERE id = $1', [t.id]);
}

beforeAll(async () => {
  try {
    await pool.query('SELECT 1');
    await cleanup();
    tenantId = (
      await pool.query('INSERT INTO tenants (name, code) VALUES ($1,$2) RETURNING id', [
        'Notif Test',
        CODE,
      ])
    ).rows[0].id;
    ready = true;
  } catch (err) {
    ready = false;
    // eslint-disable-next-line no-console
    console.warn(`[notification] skipping — ${(err as Error).message}`);
  }
});

afterAll(async () => {
  if (ready) await cleanup();
});

describe('notification service', () => {
  test('renderTemplate substitutes placeholders', () => {
    expect(renderTemplate('Hi {{name}}, code {{ code }}', { name: 'Asha', code: 123 })).toBe(
      'Hi Asha, code 123',
    );
    expect(renderTemplate('No {{missing}} here', {})).toBe('No  here');
  });

  test('sendEmail logs a sent notification via the dev provider', async ({ skip }) => {
    if (!ready) return skip();
    const entry = await sendEmail({ tenantId, to: 'a@b.example', subject: 'Hi', body: 'Body' });
    expect(entry.status).toBe('sent');
    expect(entry.provider).toBe('log');
    expect(entry.channel).toBe('email');
    const { total } = await listNotifications(tenantId, { page: 1, pageSize: 10 });
    expect(total).toBeGreaterThanOrEqual(1);
  });

  test('idempotencyKey makes a repeated send return the original (no duplicate)', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const key = 'idem-123';
    const first = await sendEmail({
      tenantId,
      to: 'c@d.example',
      subject: 'X',
      body: 'Y',
      idempotencyKey: key,
    });
    const second = await sendEmail({
      tenantId,
      to: 'c@d.example',
      subject: 'X',
      body: 'Y',
      idempotencyKey: key,
    });
    expect(second.id).toBe(first.id);
  });
});
