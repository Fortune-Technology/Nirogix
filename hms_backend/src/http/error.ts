// One consistent error shape across every module (rules.md API Rules):
//   { error: { code, message, details? } }
export type ErrorShape = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Canonical errors reused by every module. The authorization chain
// (auth → entitlement → permission) maps to UNAUTHORIZED / MODULE_NOT_ENTITLED / FORBIDDEN.
export const Errors = {
  unauthorized: (m = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', m),
  forbidden: (m = 'You do not have permission to perform this action') =>
    new AppError(403, 'FORBIDDEN', m),
  moduleNotEntitled: (m = 'This module is not available for your organization') =>
    new AppError(403, 'MODULE_NOT_ENTITLED', m),
  notFound: (m = 'Resource not found') => new AppError(404, 'NOT_FOUND', m),
  conflict: (m = 'The resource was modified by another request') =>
    new AppError(409, 'CONFLICT', m),
  validation: (details: unknown, m = 'Validation failed') =>
    new AppError(422, 'VALIDATION_ERROR', m, details),
};
