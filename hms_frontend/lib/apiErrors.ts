// Typed API failures moved to `@hms/client` (ADR-054). Re-exported for the existing
// import path; there is one definition, shared by every frontend.
export { ApiRequestError, NetworkError, TimeoutError } from '@hms/client';
