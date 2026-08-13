import pino from 'pino';
import { env, isProd } from './env';

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
  transport: isProd ? undefined : { target: 'pino-pretty', options: { colorize: true } },
});
