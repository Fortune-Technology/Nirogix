import { describe, expect, test } from 'vitest';
import { eventBus } from '../eventBus';

// Pure in-process bus — no DB, runs everywhere.
describe('domain event bus', () => {
  test('a subscriber receives the published payload', async () => {
    const received = new Promise<{ tenantId: string; userId: string; at: string }>((resolve) => {
      eventBus.subscribe('user.logged_in', (p) => resolve(p));
    });
    eventBus.publish('user.logged_in', { tenantId: 't1', userId: 'u1', at: 'now' });
    await expect(received).resolves.toEqual({ tenantId: 't1', userId: 'u1', at: 'now' });
  });

  test('a throwing subscriber does not break the others', async () => {
    eventBus.subscribe('invoice.created', () => {
      throw new Error('boom');
    });
    const ok = new Promise<string>((resolve) => {
      eventBus.subscribe('invoice.created', (p) => resolve(p.invoiceId));
    });
    eventBus.publish('invoice.created', { tenantId: 't', invoiceId: 'inv-1' });
    await expect(ok).resolves.toBe('inv-1');
  });
});
