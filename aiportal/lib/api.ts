// The AI Portal's endpoint surface (ADR-053, ADR-054).
//
// One endpoint. That is not an oversight — there is no AI capability behind this
// portal, and there will not be one until a capability is scoped and approved. What
// exists is the access boundary, so that when something does arrive it lands behind a
// door that already works and has already been tested.
//
// The HTTP core comes from `@hms/client`. Sign-in is the ordinary staff flow, because
// the people who may use this are hospital staff and platform operators — a patient
// principal is refused by the backend before any permission is read.

import { createApiClient } from '@hms/client';

export interface AiPortalSession {
  /** Empty, deliberately. A capability appears here only when one is actually built. */
  capabilities: string[];
  notice: string;
}

const client = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1',
});

export const apiClient = client;
export { ApiRequestError, NetworkError, TimeoutError } from '@hms/client';
export const {
  setAccessToken,
  getAccessToken,
  setOnSessionExpired,
  tryRefresh,
  login,
  logout,
  me,
  myPermissions,
} = client;

/** Records entry (audited server-side) and returns what the portal can actually do. */
export async function enterPortal(): Promise<AiPortalSession> {
  return client.request<AiPortalSession>('/ai/portal/session', { method: 'POST', feedback: false });
}
