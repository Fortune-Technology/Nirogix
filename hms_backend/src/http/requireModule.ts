import type { NextFunction, Request, Response } from 'express';
import { Errors } from './error';
import { isModuleEntitled } from '../modules/entitlement/entitlement.service';

// Second link of the authorization chain: requireAuth → requireModule → requirePermission →
// business logic. Gates a business module BEFORE any permission check — a tenant that has not
// purchased/activated the module gets MODULE_NOT_ENTITLED, regardless of the user's permissions.
export function requireModule(moduleKey: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth) return next(Errors.unauthorized());
    try {
      if (!(await isModuleEntitled(req.auth.tenantId, moduleKey))) {
        return next(Errors.moduleNotEntitled());
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
