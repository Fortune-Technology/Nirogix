// Augments Express's Request with the authenticated principal set by requireAuth.
// `auth` is present only after requireAuth has run; downstream code uses it to scope RLS
// (tenantId) and, later, to check permissions (roles).
declare global {
  namespace Express {
    interface Request {
      /**
       * Correlation id for this request, set by the requestContext middleware and echoed
       * as `X-Request-Id`. Present on every request (ADR-082).
       */
      requestId?: string;
      auth?: {
        userId: string;
        tenantId: string;
        roles: string[];
        impersonatedBy?: string;
        /** 'staff' | 'patient' (ADR-052). Staff routes refuse a patient by type. */
        principalType: 'staff' | 'patient';
      };
    }
  }
}

export {};
