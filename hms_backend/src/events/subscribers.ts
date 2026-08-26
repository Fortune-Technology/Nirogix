import { logger } from '../config/logger';
import { eventBus } from './eventBus';
import { getJobRunner } from '../jobs/runner';
import { registerNotificationSubscribers } from '../modules/notification/notification.subscribers';

// Wires domain events to their reactions. Called once at startup (bootstrap.ts).
export function registerSubscribers(): void {
  // A requested notification is delivered on the background queue (async), off the request path.
  eventBus.subscribe('notification.requested', async (req) => {
    await getJobRunner().enqueue('notification.send', req);
  });

  // Business events → the emails a user genuinely benefits from (appointment/payment/lab/patient).
  registerNotificationSubscribers();

  // Representative subscribers — the Activity Timeline / analytics that consume these land later;
  // for now they demonstrate the publish-once, many-subscribers pattern.
  eventBus.subscribe('user.logged_in', (e) =>
    logger.debug({ event: 'user.logged_in', ...e }, 'domain event'),
  );
  eventBus.subscribe('appointment.booked', (e) =>
    logger.debug({ event: 'appointment.booked', ...e }, 'domain event'),
  );
}
