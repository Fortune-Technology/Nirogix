import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { isProd } from '../config/env';
import { Errors } from './error';

/**
 * Rate limiting, tiered by what an endpoint costs and what abusing it buys
 * (ADR-036). One global number would either strangle the OPD queue's polling or
 * leave the login endpoint open to credential stuffing, so limits are applied per
 * risk class instead.
 *
 * Keyed by authenticated user when we know who is calling, and by IP otherwise —
 * so one noisy tenant user cannot exhaust the allowance for everyone behind a
 * shared hospital NAT.
 */

function keyGenerator(req: Request): string {
  return req.auth?.userId ?? req.ip ?? 'unknown';
}

const shared: Partial<Options> = {
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  // The canonical error shape, so the client's feedback layer renders it like any other failure.
  handler: (_req, _res, next) => next(Errors.tooManyRequests()),
  // Tests and local development would otherwise trip limits during a normal run.
  skip: () => !isProd && process.env.RATE_LIMIT_IN_DEV !== 'true',
};

/** Everything under /api/v1. Generous: normal clinical use is bursty. */
export const globalLimiter = rateLimit({ ...shared, windowMs: 60_000, limit: 300 });

/**
 * Credential endpoints. Deliberately tight and keyed by IP even when a session
 * exists, because the attack here is guessing someone else's password.
 */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60_000,
  limit: 10,
  keyGenerator: (req: Request) => req.ip ?? 'unknown',
  skipSuccessfulRequests: true, // a working login should not consume the allowance
});

/** Account-takeover-adjacent operations: password change, user creation, overrides. */
export const sensitiveLimiter = rateLimit({ ...shared, windowMs: 15 * 60_000, limit: 20 });

/** Uploads and report generation: expensive per call, rarely needed in bulk. */
export const expensiveLimiter = rateLimit({ ...shared, windowMs: 60_000, limit: 30 });
