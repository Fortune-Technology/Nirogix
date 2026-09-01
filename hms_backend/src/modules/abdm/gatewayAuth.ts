import { createPublicKey, type KeyObject, randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtHeader, type JwtPayload } from 'jsonwebtoken';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { ABDM_HEADERS, GATEWAY_PATHS } from './abdm.constants';

/**
 * Proving that an inbound ABDM callback really came from ABDM.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Until this file, every route the gateway calls was served with a rate limiter and a body schema
 * and nothing else. The reasoning at the time was ADR-056's public-endpoint posture — resolve the
 * tenant server-side, write no clinical row, answer identically for every facility, rate-limit,
 * audit — and that reasoning is sound. It defends against **enumeration**. It does not defend
 * against **forgery**, because it assumed the caller was ABDM.
 *
 * It was not. An audit against NHA's own Postman collections (31/08/2026) found a complete chain:
 * a facility id is public (HFR search is a feature we ship), so an unauthenticated caller could
 * POST a GRANTED consent notification naming any ABHA address, have `recordConsentGrant` store it
 * as a real artefact, then POST a health-information request quoting that consent with their own
 * `dataPushUrl` and their own `keyMaterial` — and receive the patient's records, encrypted to their
 * key, at their server. Every step passed validation. Nothing in the system said no.
 *
 * ── WHY IT CAN BE TURNED ON WITHOUT FEAR ────────────────────────────────────
 * The bridge currently has `services: []`: ABDM has never called these routes, so there is no
 * legitimate traffic to break. Enforcing today costs nothing and closes the hole. If NHA's
 * callbacks turn out to carry a token shape we reject, that is a fail-closed outcome — visible in
 * the log, fixable in an afternoon — and `ABDM_CALLBACK_AUTH=log` exists to observe one real
 * callback before enforcing, rather than guessing from documentation a second time.
 *
 * ── WHAT IS VERIFIED, AND WHAT DELIBERATELY IS NOT ──────────────────────────
 * The signature is checked against NHA's own published JWKS (`/api/hiecm/gateway/v3/certs`,
 * RS256, `use: "sig"`), and the standard time claims are enforced. `iss` and `aud` are **logged,
 * not enforced**: no real callback has ever been observed, and rejecting on a claim whose value we
 * have never seen would be inventing a requirement — the mistake ADR-101, ADR-102 and ADR-104 were
 * each written about. Tighten them once a genuine callback has been captured.
 */

/** How the guard behaves. `enforce` is the default and the only one safe to leave on. */
type Mode = 'enforce' | 'log' | 'off';

function mode(): Mode {
  const v = (env.ABDM_CALLBACK_AUTH ?? 'enforce').toLowerCase();
  return v === 'off' || v === 'log' ? v : 'enforce';
}

/** Cached JWKS. Short enough that a rotation is picked up, long enough not to call NHA per request. */
const JWKS_TTL_MS = 60 * 60 * 1000;
let cache: { keys: Map<string, KeyObject>; fetchedAt: number } | null = null;
let inFlight: Promise<Map<string, KeyObject>> | null = null;

interface Jwk {
  kty?: string;
  kid?: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
}

/**
 * NHA's signing keys, by `kid`.
 *
 * Concurrent callbacks share one fetch: a burst arriving on a cold cache should produce a single
 * request to the gateway, not one per callback.
 */
async function jwks(force = false): Promise<Map<string, KeyObject>> {
  const fresh = cache && Date.now() - cache.fetchedAt < JWKS_TTL_MS;
  if (fresh && !force) return cache!.keys;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const url = `${env.ABDM_GATEWAY_BASE_URL}${GATEWAY_PATHS.certs}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        [ABDM_HEADERS.requestId]: randomUUID(),
        [ABDM_HEADERS.timestamp]: new Date().toISOString(),
        [ABDM_HEADERS.cmId]: env.ABDM_CM_ID,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`ABDM certs endpoint answered ${res.status}`);

    const body = (await res.json()) as { keys?: Jwk[] };
    const keys = new Map<string, KeyObject>();
    for (const jwk of body.keys ?? []) {
      // Signing keys only. An encryption key in the same document is not ours to verify with.
      if (!jwk.kid || jwk.kty !== 'RSA' || (jwk.use && jwk.use !== 'sig')) continue;
      try {
        keys.set(jwk.kid, createPublicKey({ key: jwk as never, format: 'jwk' }));
      } catch (err) {
        logger.warn({ err, kid: jwk.kid }, 'ABDM JWKS carried a key this runtime cannot import');
      }
    }
    if (keys.size === 0) throw new Error('ABDM certs endpoint returned no usable signing key');

    cache = { keys, fetchedAt: Date.now() };
    return keys;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

export interface VerifiedCallback {
  kid: string;
  claims: JwtPayload;
}

/**
 * Verifies one bearer token against NHA's JWKS.
 *
 * An unknown `kid` triggers exactly one forced refetch — that is what a key rotation looks like,
 * and re-fetching per failed token would let anyone with a made-up `kid` drive traffic at the
 * gateway on our behalf.
 */
export async function verifyGatewayToken(token: string): Promise<VerifiedCallback> {
  const decoded = jwt.decode(token, { complete: true }) as { header: JwtHeader } | null;
  const kid = decoded?.header?.kid;
  if (!kid) throw new Error('token carries no kid');

  let keys = await jwks();
  let key = keys.get(kid);
  if (!key) {
    keys = await jwks(true);
    key = keys.get(kid);
  }
  if (!key) throw new Error(`no ABDM signing key for kid ${kid}`);

  // `algorithms` is pinned: without it a token could nominate its own algorithm, which is the
  // classic JWT confusion attack.
  const claims = jwt.verify(token, key, { algorithms: ['RS256'] }) as JwtPayload;
  return { kid, claims };
}

/**
 * The guard on every route ABDM calls.
 *
 * Refuses with 401 and a bare code. That is deliberately not the uniform-202 treatment the rest of
 * these routes give an unknown facility: hiding *which hospitals exist* is worth doing, while
 * hiding *that this endpoint needs a token* protects nobody and would leave a genuine ABDM
 * misconfiguration looking like success.
 */
export function requireAbdmGateway(req: Request, res: Response, next: NextFunction): void {
  const active = mode();
  if (active === 'off') return next();

  const header = req.header('authorization') ?? '';
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();

  if (!token) {
    if (active === 'log') {
      logger.warn({ path: req.path, headers: Object.keys(req.headers) }, 'ABDM callback carried no bearer token (log mode — allowed)');
      return next();
    }
    logger.warn({ path: req.path }, 'ABDM callback refused: no bearer token');
    res.status(401).json({ error: { code: 'ABDM_CALLBACK_UNAUTHENTICATED', message: 'Unauthenticated' } });
    return;
  }

  verifyGatewayToken(token)
    .then(({ kid, claims }) => {
      // Logged rather than enforced until a real callback has been seen — see the header comment.
      logger.info({ path: req.path, kid, iss: claims.iss, aud: claims.aud, sub: claims.sub }, 'ABDM callback verified');
      next();
    })
    .catch((err: unknown) => {
      if (active === 'log') {
        logger.warn({ err, path: req.path }, 'ABDM callback failed verification (log mode — allowed)');
        return next();
      }
      logger.warn({ err, path: req.path }, 'ABDM callback refused: token did not verify');
      res.status(401).json({ error: { code: 'ABDM_CALLBACK_UNAUTHENTICATED', message: 'Unauthenticated' } });
    });
}

/** Test seam: drops the cached JWKS so a suite can exercise a cold fetch. */
export function resetGatewayJwksCache(): void {
  cache = null;
  inFlight = null;
}
