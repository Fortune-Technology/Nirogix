import { registerProcessors } from './jobs/processors';
import { registerSubscribers } from './events/subscribers';
import { logger } from './config/logger';
import { env } from './config/env';
import { startHiuSweeper } from './modules/abdm/hiuSweeper';

let initialized = false;

// Registers job processors + domain-event subscribers. Idempotent — called at server startup and
// by tests that exercise the events → jobs pipeline.
export function initBackground(): void {
  if (initialized) return;
  registerProcessors();
  registerSubscribers();
  // A deletion obligation with a deadline (ADR-092) — see hiuSweeper.ts for why it is a timer
  // rather than a queued job.
  startHiuSweeper();
  initialized = true;
  logger.info(
    env.REDIS_URL
      ? 'Background jobs on Redis/BullMQ'
      : 'Background jobs running inline (no REDIS_URL set)',
  );
}
