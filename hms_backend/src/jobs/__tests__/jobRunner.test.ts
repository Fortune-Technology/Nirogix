import { describe, expect, test } from 'vitest';
import { InlineJobRunner } from '../inlineRunner';

// The inline runner (dev/CI fallback) — no Redis, runs everywhere.
describe('inline job runner', () => {
  test('enqueue runs the registered processor with the data', async () => {
    const runner = new InlineJobRunner();
    const done = new Promise<{ to: string }>((resolve) => {
      runner.registerProcessor('notification.send', async (data) => resolve(data));
    });
    await runner.enqueue('notification.send', {
      channel: 'email',
      tenantId: 't',
      to: 'a@b.c',
      subject: 's',
      body: 'b',
    });
    await expect(done).resolves.toMatchObject({ to: 'a@b.c' });
  });

  test('enqueue without a registered processor does not throw', async () => {
    const runner = new InlineJobRunner();
    await expect(
      runner.enqueue('notification.send', { channel: 'email', tenantId: 't', to: 'x', body: 'y' }),
    ).resolves.toBeUndefined();
  });
});
