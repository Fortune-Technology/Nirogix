import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, type ErrorShape } from './error';
import { logger } from '../config/logger';

// Terminal Express error middleware. Turns AppError / ZodError / anything else into the
// single canonical error shape. Never leaks internals on a 500.
export function errorHandler(
  err: unknown,
  _req: Request,
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

  logger.error({ err }, 'Unhandled error');
  const body: ErrorShape = {
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  };
  res.status(500).json(body);
}
