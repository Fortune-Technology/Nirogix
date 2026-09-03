import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { ABDM_HEADERS } from './abdm.constants';
import { getAccessToken, invalidateAccessToken } from './abdm.session';
import { parseAbdmError } from './providers/gatewayProvider';
import { AbdmGatewayError } from './providers/types';

/**
 * The HIP half of ABDM, on the **gateway** host (ADR-089).
 *
 * Milestone 1 talks to the ABHA host; everything a Health Information Provider does talks to
 * `ABDM_GATEWAY_BASE_URL`. Sending an M2 call to the M1 host produces a 404 that reads like a
 * missing feature, so the two clients are deliberately separate rather than one with a flag.
 *
 * Like the M1 adapter this honours exactly one retry — NHA can invalidate a session token before
 * its stated expiry, and the right answer to their 401 is a fresh token and one more attempt.
 *
 * **Mock mode records instead of sending.** Every M2 flow is asynchronous — we call, NHA answers on
 * a webhook — so a test that could only run against the real gateway could not assert anything at
 * all until the bridge URL exists. The recorder makes the request itself testable today, which is
 * the only part we control.
 */

export type HipCall = { path: string; body: unknown; headers: Record<string, string> };

/** Calls made in mock mode, newest last. Test-only; never read in production. */
const recorded: HipCall[] = [];

export function recordedHipCalls(): readonly HipCall[] {
  return recorded;
}

export function clearRecordedHipCalls(): void {
  recorded.length = 0;
}

/**
 * POSTs to the gateway.
 *
 * `linkToken` is passed separately from the session token because they authenticate different
 * things: the session says *we* are a registered participant, the link token says *this patient*
 * allowed us to attach records to their ABHA.
 */
export async function hipPost(
  path: string,
  body: unknown,
  options: { hipId?: string; linkToken?: string } = {},
  retryOn401 = true,
): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    [ABDM_HEADERS.requestId]: randomUUID(),
    [ABDM_HEADERS.timestamp]: new Date().toISOString(),
    [ABDM_HEADERS.cmId]: env.ABDM_CM_ID,
  };
  if (options.hipId) headers[ABDM_HEADERS.hipId] = options.hipId;
  if (options.linkToken) headers['X-LINK-TOKEN'] = options.linkToken;

  if (env.ABDM_PROVIDER !== 'gateway') {
    recorded.push({ path, body, headers });
    logger.info({ path }, 'ABDM HIP call recorded (mock provider)');
    return { acknowledged: true };
  }

  headers[ABDM_HEADERS.authorization] = `Bearer ${await getAccessToken()}`;
  const res = await fetch(`${env.ABDM_GATEWAY_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (res.status === 401 && retryOn401) {
    invalidateAccessToken();
    return hipPost(path, body, options, false);
  }

  const text = await res.text();
  if (!res.ok) {
    const { code, message } = parseAbdmError(text, res.status);
    logger.error(
      { path, status: res.status, abdmCode: code, body: text.slice(0, 2000) },
      'ABDM rejected a HIP call',
    );
    throw new AbdmGatewayError(res.status, code, message);
  }

  // Most HIP calls acknowledge with an empty body and answer properly on the webhook.
  try {
    return text ? JSON.parse(text) : { acknowledged: true };
  } catch {
    return { acknowledged: true, raw: text };
  }
}

/**
 * POSTs encrypted records to a HIU's own `dataPushUrl` (ADR-091).
 *
 * Deliberately not the gateway and deliberately not allowlisted: the HIU nominates the endpoint in
 * its request, and the protection on this hop is that the payload is unreadable to anyone but the
 * holder of the matching private key — not that we recognise the host. It also carries none of our
 * gateway credentials, because nothing about this call is us proving who we are.
 *
 * Recorded rather than sent in mock mode, for the same reason as every other M2 call.
 */
export async function pushToHiu(
  url: string,
  body: unknown,
): Promise<{ ok: boolean; status: number }> {
  if (env.ABDM_PROVIDER !== 'gateway') {
    recorded.push({ path: url, body, headers: { 'Content-Type': 'application/json' } });
    logger.info({ url }, 'ABDM data push recorded (mock provider)');
    return { ok: true, status: 202 };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) logger.error({ url, status: res.status }, 'The HIU rejected the data push');
  return { ok: res.ok, status: res.status };
}
