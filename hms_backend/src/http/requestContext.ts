/**
 * One id per request, carried everywhere that request is recorded (ADR-082,
 * SECURITY-AUDIT.md L-3).
 *
 * The audit trail, the structured log and the error tracker each described the same
 * request in their own vocabulary, with nothing linking them: correlating "the receptionist
 * says the invoice failed at about 3pm" with a log line and an exception meant matching
 * timestamps by hand. Now a single id is generated at the edge, returned to the caller as
 * `X-Request-Id`, attached to every log line by pino, attached to the error-tracker event,
 * and stored on every audit row the request writes.
 *
 * It is held in an AsyncLocalStorage so a service deep in a call stack can record it without
 * every function in between taking a parameter it does not otherwise care about — the same
 * shape as the tenant context, and for the same reason.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export type RequestContext = { requestId: string };

const storage = new AsyncLocalStorage<RequestContext>();

/** The current request's id, or undefined outside a request (jobs, scripts, tests). */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/**
 * An inbound `X-Request-Id` is honoured so a trace survives the reverse proxy — but only
 * when it is plainly an id. Anything else is client-controlled text heading for the log and
 * the audit table, so it is replaced rather than sanitised.
 */
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function resolveRequestId(header: unknown): string {
  return typeof header === 'string' && SAFE_ID.test(header) ? header : randomUUID();
}

/** Must run before the logger, so every line for this request carries the same id. */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = resolveRequestId(req.headers['x-request-id']);
  req.requestId = requestId;
  // Echoed back so a user reporting a problem can quote the id straight from the response,
  // and so the frontend can attach it to a support report.
  res.setHeader('X-Request-Id', requestId);
  storage.run({ requestId }, () => next());
}
