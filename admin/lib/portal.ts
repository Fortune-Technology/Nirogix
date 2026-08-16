/**
 * Where the Nirogix Portal lives, from configuration (ADR-051, `resources/domains.md` §8).
 *
 * The admin app and the Portal are now **different origins**. That matters most in the
 * support-session handoff: the operator starts a session here and the token is handed
 * to a Portal tab by `postMessage`, which is only safe when both ends name the other's
 * origin explicitly. Before the split both sides used `window.location.origin`, which
 * was correct then and is silently wrong now — it would post the token to the admin
 * origin, where nothing is listening.
 *
 * No host is hard-coded anywhere else; this is the single place the admin app knows
 * the Portal exists.
 */
export const PORTAL_URL = (process.env.NEXT_PUBLIC_PORTAL_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** The origin to use as `targetOrigin` when posting a support token to the Portal. */
export const PORTAL_ORIGIN = (() => {
  try {
    return new URL(PORTAL_URL).origin;
  } catch {
    return PORTAL_URL;
  }
})();

/** The Portal route that claims a support session token. */
export const PORTAL_SUPPORT_ENTER_URL = `${PORTAL_URL}/support/enter`;
