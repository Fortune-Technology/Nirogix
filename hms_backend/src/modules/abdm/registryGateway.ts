import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { ABDM_HEADERS } from './abdm.constants';
import { getAccessToken, invalidateAccessToken } from './abdm.session';
import { parseAbdmError } from './providers/gatewayProvider';
import { AbdmGatewayError } from './providers/types';

/**
 * The national registries — HFR and HPR (ADR-096).
 *
 * A **third** ABDM host. M1 talks to the ABHA host, M2/M3 to the HIE-CM gateway, and Milestone 4 to
 * `apihspsbx.abdm.gov.in/v4/int`, which serves both registries. Sending a call to the wrong one of
 * the three produces a 401 or a 404 that reads like a permissions problem, so the clients stay
 * deliberately separate rather than becoming one with a flag.
 *
 * Two things are established fact rather than assumption, both checked against the live sandbox
 * before this file existed:
 *
 * - **The ordinary gateway session token authenticates here.** There is no separate credential to
 *   obtain; only the base URL differs. Verified by calling the master-data endpoints and getting
 *   real LGD states and medical councils back.
 * - **Our client already holds the `hfr` and `hp_id` roles**, read from the session token's own
 *   claims. NHA's onboarding note says to request them; ours were already granted.
 *
 * Unlike the M2/M3 clients this one is **not mocked into a recorder**. Every M4 call is a plain
 * request/response against endpoints that answer today — there is no webhook to wait for — so the
 * honest test double is the real sandbox for reads, and refusal for writes.
 */

/** GET is used heavily here: most of M4's surface is master data the forms need. */
export async function registryGet<T = unknown>(
  path: string,
  query?: Record<string, string | number>,
): Promise<T> {
  const url = new URL(`${env.ABDM_HFR_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, String(value));
  return registryCall<T>(url.toString(), 'GET');
}

export async function registryPost<T = unknown>(path: string, body: unknown): Promise<T> {
  return registryCall<T>(`${env.ABDM_HFR_BASE_URL}${path}`, 'POST', body);
}

export async function registryPut<T = unknown>(path: string, body: unknown): Promise<T> {
  return registryCall<T>(`${env.ABDM_HFR_BASE_URL}${path}`, 'PUT', body);
}

/**
 * One call, with the same single-retry-on-401 rule as the other two clients.
 *
 * NHA can invalidate a session before its stated expiry; the right answer to their 401 is a fresh
 * token and one more attempt, not a failure surfaced to an administrator mid-form.
 */
async function registryCall<T>(
  url: string,
  method: string,
  body?: unknown,
  retryOn401 = true,
): Promise<T> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'Content-Type': 'application/json',
    [ABDM_HEADERS.requestId]: randomUUID(),
    [ABDM_HEADERS.timestamp]: new Date().toISOString(),
    [ABDM_HEADERS.authorization]: `Bearer ${await getAccessToken()}`,
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && retryOn401) {
    invalidateAccessToken();
    return registryCall<T>(url, method, body, false);
  }

  const text = await res.text();
  if (!res.ok) {
    const { code, message } = parseAbdmError(text, res.status);
    // The path, never the body: a registry request can carry an encrypted Aadhaar and a
    // professional's identity details, and neither belongs in a log line.
    logger.error(
      { path: new URL(url).pathname, status: res.status, abdmCode: code },
      'ABDM registry rejected a call',
    );
    throw new AbdmGatewayError(res.status, code, message);
  }

  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    return {} as T;
  }
}

/**
 * Master data, cached in memory for the process lifetime.
 *
 * States, districts, councils and colleges change on the order of years, and a registration form
 * that re-fetched the medical-council list on every keystroke would be both slow and rude to a
 * government sandbox. Cached per path+query, never per tenant — none of it is tenant data.
 */
const masterCache = new Map<string, { value: unknown; expiresAt: number }>();
const MASTER_TTL_MS = 6 * 60 * 60_000;

/**
 * Reads a registry reference list — by GET or by POST, whichever that list actually uses.
 *
 * **Four of HFR's nine reference endpoints are POST**, and they take their filter in a JSON body
 * rather than a query string: `fetch-facility-type`, `fetch-facility-Sub-type`, `get-owner-subtype`
 * and `get-specialities`. This function fetched every one of them with GET until the registration
 * form was first pointed at a live sandbox, at which point exactly those four came back empty while
 * the five GET lists filled correctly. Nothing threw — an empty list is a valid response — so the
 * form simply showed four dropdowns with no options and no reason why.
 *
 * `body` is what decides the verb. Callers pass the filter the endpoint documents; a list that
 * takes no filter stays a GET.
 */
export async function registryMasterData<T = unknown>(
  path: string,
  query?: Record<string, string | number>,
  body?: Record<string, string>,
): Promise<T> {
  const parts = Object.entries(query ?? {})
    .concat(Object.entries(body ?? {}))
    .map(([k, v]) => `${k}=${String(v)}`)
    .sort()
    .join('&');
  // The verb is part of the cache key: the same path can legitimately be read both ways.
  const key = `${body ? 'POST' : 'GET'} ${path}?${parts}`;
  const hit = masterCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;

  const value = body ? await registryPost<T>(path, body) : await registryGet<T>(path, query);
  masterCache.set(key, { value, expiresAt: Date.now() + MASTER_TTL_MS });
  return value;
}

/** Test-only, and used by the self-check so one run never reads another's cache. */
export function clearMasterDataCache(): void {
  masterCache.clear();
}
