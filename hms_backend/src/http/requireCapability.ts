import type { NextFunction, Request, Response } from 'express';
import { Errors } from './error';
import { isCapabilityEntitled } from '../modules/entitlement/capability.service';

// Third link of the authorization chain (ADR-085):
//   requireAuth → requireModule → requireCapability → requirePermission → business logic.
// Gates a specific capability (a sub-feature of a module) AFTER the module gate and BEFORE the
// permission check. Deny-by-exception: a capability is entitled whenever its module is entitled
// and no effective override disables it, so this is transparent for a module with the capability
// left on. A tenant whose organization has switched the capability off gets CAPABILITY_NOT_ENTITLED
// regardless of the user's permissions — a capability is what the system supports, a permission is
// who may use it. Always compose it after `requireModule(moduleKey)` for the same module.
export function requireCapability(moduleKey: string, capabilityKey: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth) return next(Errors.unauthorized());
    try {
      if (!(await isCapabilityEntitled(req.auth.tenantId, moduleKey, capabilityKey))) {
        return next(Errors.capabilityNotEntitled());
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
