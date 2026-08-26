import pino from 'pino';
import { env, isProd } from './env';
import { scrubAadhaar } from '../security/redaction';

// Structured logging from day one, with PII/secret masking (rules.md Security Rules):
// authorization headers, cookies, passwords, and tokens are redacted everywhere.
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
    ],
    censor: '[REDACTED]',
  },
  // Aadhaar-shaped values are masked on the way out of the process, whatever object they are
  // hiding in (ADR-084). `redact` above only covers known paths; an Aadhaar number arrives
  // inside an arbitrary provider error body or a validation `details` blob, so the scrub has to
  // walk the argument. Runs on every log call, which is why it is depth- and cycle-bounded —
  // see security/redaction.ts.
  hooks: {
    logMethod(args, method) {
      return method.apply(this, scrubAadhaar(args) as typeof args);
    },
  },
  transport: isProd ? undefined : { target: 'pino-pretty', options: { colorize: true } },
});
