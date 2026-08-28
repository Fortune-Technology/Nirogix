import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, type ErrorShape } from './error';
import { errorTracker } from '../observability/errorTracker';

// Terminal Express error middleware. Turns AppError / ZodError / anything else into the
// single canonical error shape. Never leaks internals on a 500.
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    const body: ErrorShape = {
      error: { code: err.code, message: err.message, details: err.details },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof ZodError) {
    const body: ErrorShape = {
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: err.flatten() },
    };
    res.status(422).json(body);
    return;
  }

  // Unexpected (5xx): send to the error tracker with request correlation, never leak internals.
  // The id is the one the audit row, the log lines and the `X-Request-Id` response header all
  // carry (ADR-082) — one value ties the three records of this request together.
  errorTracker.captureException(err, {
    requestId: req.requestId,
    tenantId: req.auth?.tenantId,
    userId: req.auth?.userId,
    method: req.method,
    path: req.originalUrl,
  });
  const body: ErrorShape = {
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  };
  res.status(500).json(body);
}
