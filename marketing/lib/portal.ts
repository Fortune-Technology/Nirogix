// Where the "Sign in" actions send visitors — the Portal's login route. Configurable
// per environment (local / staging / production) via NEXT_PUBLIC_PORTAL_LOGIN_URL,
// never hard-coded.
export const PORTAL_LOGIN_URL =
  process.env.NEXT_PUBLIC_PORTAL_LOGIN_URL ?? "http://localhost:3001/login";
