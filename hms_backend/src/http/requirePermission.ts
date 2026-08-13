import type { NextFunction, Request, Response } from 'express';
import { Errors } from './error';
import { resolvePermissions, hasPermission } from '../modules/rbac/rbac.service';

// Third link of the authorization chain: requireAuth → (requireModule) → requirePermission →
// business logic. Resolves the user's effective permissions (cached) and enforces the required
// key. A route's required permission is declared explicitly here — never inferred (rules.md).
export function requirePermission(permission: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth) return next(Errors.unauthorized());
    try {
      const resolved = await resolvePermissions(req.auth.tenantId, req.auth.userId);
      if (!hasPermission(resolved, permission)) return next(Errors.forbidden());
      next();
    } catch (err) {
      next(err);
    }
  };
}
