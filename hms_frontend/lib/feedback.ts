// The feedback layer moved to `@hms/client` (ADR-054) so every frontend classifies a
// failure and phrases it the same way. Re-exported here because pages and the API
// client already import it from this path.
export { describeError, notifyError, notifySuccess, successMessage } from '@hms/client';
