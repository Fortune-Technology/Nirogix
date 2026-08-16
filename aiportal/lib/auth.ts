// Session context for this app — the shared implementation from `@hms/client`
// (ADR-054), re-exported so every page imports it from one place and the app's own
// API client is the one driving it.
export { useAuth, useCan } from "@hms/client";
export type { AuthContextValue } from "@hms/client";
