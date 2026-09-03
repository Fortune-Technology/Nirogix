import { env } from '../config/env';
import { logger } from '../config/logger';
import { scrubAadhaar } from '../security/redaction';

// Error tracking behind a thin abstraction (ADR-007 provider pattern) so an external
// tracker (Sentry / GlitchTip — both use the Sentry SDK) can be wired in without touching
// call sites. Until `SENTRY_DSN` is set, the default tracker just logs a structured
// `error.captured` event (which the log pipeline/alerting can key off). No PII beyond what
// the request already carries; the logger's redaction still applies.
//
// To enable a real tracker later: add `@sentry/node`, init it here when a DSN is present,
// and forward `captureException` to `Sentry.captureException`. The interface below does not
// change, so nothing else in the app needs editing.

export interface ErrorContext {
  requestId?: string;
  tenantId?: string;
  userId?: string;
  method?: string;
  path?: string;
}

export interface ErrorTracker {
  captureException(err: unknown, context?: ErrorContext): void;
}

class LogErrorTracker implements ErrorTracker {
  captureException(err: unknown, context: ErrorContext = {}): void {
    // Scrubbed here as well as in the logger: when a real tracker (Sentry/GlitchTip) is wired
    // in below, it will NOT pass through pino, and an Aadhaar number must not reach a
    // third-party service under any transport (ADR-084).
    logger.error(
      { err: scrubAadhaar(err), ...context, event: 'error.captured' },
      'Captured server error',
    );
  }
}

// Selected once at startup. When SENTRY_DSN is configured we still log, but this is the
// single place a real transport is plugged in.
export const errorTracker: ErrorTracker = new LogErrorTracker();

export const isErrorTrackingConfigured = Boolean(env.SENTRY_DSN);
