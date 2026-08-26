// @hms/client — the shared frontend client foundation (ADR-054).
//
// Everything a Nirogix frontend needs to talk to the backend and render a session,
// with exactly one implementation of the parts that must not drift: token handling,
// the single in-flight refresh, the 401 retry, error classification, the one-toast
// rule, and permission resolution.
//
// What each app keeps for itself: its DOMAIN endpoints (so an audience's API surface
// stays narrow — ADR-051), its navigation, and its 403 panel.

export { ApiRequestError, NetworkError, TimeoutError } from './errors';
export { describeError, notifyError, notifySuccess, successMessage } from './feedback';
export { createApiClient } from './http';
export type { ApiClient, ApiClientOptions, RequestOptions } from './http';
export {
  AuthProvider,
  useAuth,
  useCan,
  // Module & capability entitlement mirrors (ADR-085) — visibility only, never the boundary.
  useModule,
  useCapability,
  useEnabledModules,
  useEnabledCapabilities,
} from './auth';
export type { AuthContextValue } from './auth';
// Idle-session policy (ADR-082). Apps override the window through <AuthProvider
// idleTimeoutMs={...}>; the constants are exported so a settings screen or a test can
// state the same number rather than restating it.
export { DEFAULT_IDLE_TIMEOUT_MS, isIdle, useIdleSignOut } from './idle';
export { Can, RequirePermission } from './guards';
