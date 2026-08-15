import type { CorsOptions } from 'cors';
import { env, isProd } from './env';
import { logger } from './logger';

/**
 * CORS policy (ADR-036).
 *
 * The API sets `credentials: true` so the httpOnly refresh cookie flows from the
 * Portal's origin. Combined with a reflected origin (`origin: true`), that would
 * let ANY website call this API with the signed-in user's cookie — so production
 * requires an explicit allowlist, configured through `CORS_ORIGINS`.
 *
 * Development keeps the permissive behaviour: localhost ports move around, and the
 * cookie is not `Secure` there anyway.
 */
export function corsOptions(): CorsOptions {
  const allowlist = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (!isProd) return { origin: true, credentials: true };

  if (allowlist.length === 0) {
    // Fail loudly rather than silently accepting every origin in production.
    logger.error(
      'CORS_ORIGINS is empty in production: cross-origin browser requests will be refused. ' +
        'Set it to the Portal and marketing origins.',
    );
  }

  return {
    credentials: true,
    origin(origin, callback) {
      // Same-origin and non-browser callers (curl, server-to-server) send no Origin.
      if (!origin) return callback(null, true);
      if (allowlist.includes(origin)) return callback(null, true);
      logger.warn({ origin }, 'Blocked a cross-origin request from an origin that is not allowlisted');
      return callback(null, false);
    },
  };
}
