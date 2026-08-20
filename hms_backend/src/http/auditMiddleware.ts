import type { NextFunction, Request, Response } from 'express';
import { writeAudit } from '../modules/audit/audit.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Auto-audits authenticated mutating requests. Attaches a res 'finish' listener so the actual
// status code is captured. Unauthenticated mutations (login) and security-relevant service events
// (permission/entitlement changes) are audited explicitly with richer context. Best-effort.
export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING.has(req.method)) return next();
  res.on('finish', () => {
    if (!req.auth) return; // audited explicitly where the tenant/actor is known
    void writeAudit({
      tenantId: req.auth.tenantId,
      actorUserId: req.auth.userId,
      action: `${req.method} ${req.path}`,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      severity: res.statusCode >= 400 ? 'warning' : 'info',
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  });
  next();
}
