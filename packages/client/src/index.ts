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
export { AuthProvider, useAuth, useCan } from './auth';
export type { AuthContextValue } from './auth';
export { Can, RequirePermission } from './guards';
