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

/**
 * The same question, asked **inside** a handler instead of in front of it.
 *
 * For the handful of routes whose required permission is not knowable from the route table —
 * bulk import (ADR-138), where the module is a path parameter and each module carries its own
 * key, so a fixed `requirePermission` could only ever have named one of six.
 *
 * This is not a loosening. The handler still refuses, with the same 403, before doing anything;
 * what moves is only *where* the key comes from. Every other route keeps declaring its permission
 * explicitly in the route table, which is what `resources/rules.md` asks for and what makes the
 * boundary readable without opening a controller.
 */
export async function checkPermission(req: Request, permission: string): Promise<boolean> {
  if (!req.auth) return false;
  const resolved = await resolvePermissions(req.auth.tenantId, req.auth.userId);
  return hasPermission(resolved, permission);
}
