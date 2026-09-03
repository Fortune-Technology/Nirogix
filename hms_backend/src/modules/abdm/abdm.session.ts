import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { GATEWAY_PATHS, ABDM_HEADERS } from './abdm.constants';
import { AbdmGatewayError } from './providers/types';

/**
 * ABDM gateway session token — obtained once, reused, refreshed before it expires (ADR-084).
 *
 * NHA issues a short-lived bearer token from the client id/secret. Requesting one per API call
 * would triple the latency of every counter interaction and is the kind of thing that gets
 * flagged at the sandbox-exit review, so the token is cached in-process with a refresh margin.
 *
 * **In-process, deliberately.** The token is not tenant data — it belongs to the Nirogix
 * application registration — so there is nothing to isolate, and a Redis round trip would add a
 * dependency to a path that must not fail when Redis is down. Several app processes each holding
 * their own token is normal and supported by NHA.
 *
 * A concurrent burst of first requests shares one in-flight promise rather than racing to
 * request several tokens (NHA rate-limits session issuance).
 */

type CachedToken = { accessToken: string; expiresAt: number };

let cached: CachedToken | null = null;
let inFlight: Promise<string> | null = null;

/** Refresh this long before the real expiry, so a request never starts with a token about to die. */
const REFRESH_MARGIN_MS = 60_000;
/** Used only if NHA omits `expiresIn`. Short on purpose — under-caching is safe, over-caching is not. */
const FALLBACK_TTL_MS = 10 * 60_000;

/** Headers every V3 call carries. `hipId` is per tenant and omitted when the call is not HIP-scoped. */
export function baseHeaders(hipId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    [ABDM_HEADERS.requestId]: randomUUID(),
    [ABDM_HEADERS.timestamp]: new Date().toISOString(),
    [ABDM_HEADERS.cmId]: env.ABDM_CM_ID,
  };
  if (hipId) headers[ABDM_HEADERS.hipId] = hipId;
  return headers;
}

async function requestToken(): Promise<string> {
  const url = `${env.ABDM_GATEWAY_BASE_URL}${GATEWAY_PATHS.sessions}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: baseHeaders(),
    body: JSON.stringify({
      clientId: env.ABDM_CLIENT_ID,
      clientSecret: env.ABDM_CLIENT_SECRET,
      grantType: 'client_credentials',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    // The client secret is in the request, never in the response — but the body is still an
    // external string, so it goes out through the logger's scrub like everything else.
    logger.error({ status: res.status, body }, 'ABDM session request failed');
    throw new AbdmGatewayError(
      res.status,
      'ABDM_SESSION_FAILED',
      'Could not authenticate with ABDM',
    );
  }

  const data = (await res.json()) as { accessToken?: string; expiresIn?: number };
  if (!data.accessToken) {
    throw new AbdmGatewayError(502, 'ABDM_SESSION_EMPTY', 'ABDM returned no access token');
  }

  const ttl = data.expiresIn ? data.expiresIn * 1000 : FALLBACK_TTL_MS;
  cached = { accessToken: data.accessToken, expiresAt: Date.now() + ttl };
  logger.info({ expiresInMs: ttl }, 'ABDM session token issued');
  return data.accessToken;
}

/** The current access token, refreshing it when missing or close to expiry. */
export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) return cached.accessToken;
  if (inFlight) return inFlight;

  inFlight = requestToken().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Drops the cached token. Called when NHA answers 401 — a token can be invalidated on their side
 * before it expires on ours, and one retry with a fresh token is the correct response.
 */
export function invalidateAccessToken(): void {
  cached = null;
}

/** Test seam: lets a test assert caching behaviour without reaching the network. */
export function __setCachedTokenForTests(token: CachedToken | null): void {
  cached = token;
}
