import { EventEmitter } from 'node:events';
import { logger } from '../config/logger';
import type { DomainEventPayload, DomainEventType } from './types';

// In-process event bus — NOT Kafka, not a broker (architecture.md). A module publishes an event
// once; any number of subscribers react. A failing subscriber is logged and never breaks the
// publisher or the other subscribers.
class EventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  subscribe<K extends DomainEventType>(
    type: K,
    handler: (payload: DomainEventPayload[K]) => void | Promise<void>,
  ): void {
    this.emitter.on(type, (payload: DomainEventPayload[K]) => {
      Promise.resolve()
        .then(() => handler(payload))
        .catch((err) => logger.error({ err, event: type }, 'Domain event handler failed'));
    });
  }

  publish<K extends DomainEventType>(type: K, payload: DomainEventPayload[K]): void {
    this.emitter.emit(type, payload);
  }
}

export const eventBus = new EventBus();
