// Augments Express's Request with the authenticated principal set by requireAuth.
// `auth` is present only after requireAuth has run; downstream code uses it to scope RLS
// (tenantId) and, later, to check permissions (roles).
declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; tenantId: string; roles: string[]; impersonatedBy?: string };
    }
  }
}

export {};
