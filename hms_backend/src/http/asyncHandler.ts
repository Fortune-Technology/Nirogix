import type { NextFunction, Request, Response } from 'express';

// Wraps an async route handler so a rejected promise flows to the error middleware
// (Express 4 does not catch async errors automatically).
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
