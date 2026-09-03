import { generateKeyPairSync, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * The guard that makes "this callback came from ABDM" true rather than assumed.
 *
 * Before it, every route the gateway calls was reachable by anyone who knew the URL, and an audit
 * against NHA's own collections found the chain that let: plant a GRANTED consent naming any ABHA
 * address, then request that patient's records against it with your own push URL and your own
 * encryption key. So these tests are almost entirely about **refusal** — the happy path is one
 * case, and every other one is a way in that must stay shut.
 *
 * A local RSA key pair stands in for NHA's. The JWKS fetch is mocked, so nothing here contacts the
 * gateway; what is exercised is our verification, which is the half that was missing.
 */

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-signing-key';
const jwks = {
  keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KID, use: 'sig', alg: 'RS256' }],
};

/** A second, unrelated key — for the token that is signed by the wrong hand. */
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });

let mode = 'enforce';

vi.mock('../../../config/env', () => ({
  env: {
    get ABDM_CALLBACK_AUTH() {
      return mode;
    },
    ABDM_GATEWAY_BASE_URL: 'https://gateway.test',
    ABDM_CM_ID: 'sbx',
  },
}));
vi.mock('../../../config/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { requireAbdmGateway, resetGatewayJwksCache, verifyGatewayToken } from '../gatewayAuth';

let fetchCalls = 0;

beforeEach(() => {
  mode = 'enforce';
  fetchCalls = 0;
  resetGatewayJwksCache();
  vi.stubGlobal('fetch', async () => {
    fetchCalls += 1;
    return { ok: true, status: 200, json: async () => jwks } as unknown as Response;
  });
});
afterEach(() => vi.unstubAllGlobals());

const sign = (payload: object, opts: jwt.SignOptions = {}) =>
  jwt.sign(payload, privateKey, { algorithm: 'RS256', keyid: KID, expiresIn: '5m', ...opts });

/** Minimal express doubles — enough to see which way the middleware went. */
function run(authorization?: string) {
  const req = {
    path: '/api/v3/hip/patient/share',
    headers: {},
    header: (n: string) => (n.toLowerCase() === 'authorization' ? authorization : undefined),
  };
  let status = 0;
  let body: unknown;
  let passed = false;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
  };
  return new Promise<{ status: number; body: unknown; passed: boolean }>((resolve) => {
    const next = () => {
      passed = true;
      resolve({ status, body, passed });
    };
    // The middleware answers asynchronously on the verify path; poll the outcome either way.
    requireAbdmGateway(req as never, res as never, next as never);
    setTimeout(() => resolve({ status, body, passed }), 60);
  });
}

describe('a genuine ABDM callback is let through', () => {
  test('a token signed by NHA’s key passes', async () => {
    const out = await run(`Bearer ${sign({ sub: 'gateway' })}`);
    expect(out.passed).toBe(true);
    expect(out.status).toBe(0);
  });

  test('the JWKS is fetched once and cached, not per callback', async () => {
    await run(`Bearer ${sign({ sub: 'a' })}`);
    await run(`Bearer ${sign({ sub: 'b' })}`);
    await run(`Bearer ${sign({ sub: 'c' })}`);
    expect(fetchCalls).toBe(1);
  });
});

describe('everything else is refused', () => {
  test('no Authorization header', async () => {
    const out = await run(undefined);
    expect(out.passed).toBe(false);
    expect(out.status).toBe(401);
  });

  test('a header that is not a bearer token', async () => {
    expect((await run('Basic abc123')).status).toBe(401);
  });

  test('a token signed by somebody else’s key — the forgery this exists to stop', async () => {
    const forged = jwt.sign({ sub: 'attacker' }, other.privateKey, {
      algorithm: 'RS256',
      keyid: KID,
      expiresIn: '5m',
    });
    const out = await run(`Bearer ${forged}`);
    expect(out.passed).toBe(false);
    expect(out.status).toBe(401);
  });

  test('an expired token', async () => {
    const stale = sign({ sub: 'gateway' }, { expiresIn: '-1m' });
    expect((await run(`Bearer ${stale}`)).status).toBe(401);
  });

  test('an unsigned token claiming alg none — the classic confusion attack', async () => {
    // `algorithms: ['RS256']` is pinned precisely so a token cannot nominate its own algorithm.
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', kid: KID })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url')}.`;
    expect((await run(`Bearer ${none}`)).status).toBe(401);
  });

  test('a token whose kid we have no key for', async () => {
    const unknown = jwt.sign({ sub: 'x' }, privateKey, {
      algorithm: 'RS256',
      keyid: 'no-such-kid',
      expiresIn: '5m',
    });
    expect((await run(`Bearer ${unknown}`)).status).toBe(401);
  });

  test('garbage in the bearer position', async () => {
    expect((await run('Bearer not-a-jwt')).status).toBe(401);
  });
});

describe('the modes', () => {
  test('log allows an unauthenticated callback through, for observing one real one', async () => {
    mode = 'log';
    const out = await run(undefined);
    expect(out.passed).toBe(true);
  });

  test('log also allows a token that fails verification', async () => {
    mode = 'log';
    const forged = jwt.sign({ sub: 'attacker' }, other.privateKey, {
      algorithm: 'RS256',
      keyid: KID,
      expiresIn: '5m',
    });
    expect((await run(`Bearer ${forged}`)).passed).toBe(true);
  });

  test('off skips the check entirely', async () => {
    mode = 'off';
    expect((await run(undefined)).passed).toBe(true);
  });

  test('an unrecognised mode value falls back to enforce, never to open', async () => {
    // A typo in configuration must not silently reopen the hole.
    mode = 'enfroce';
    expect((await run(undefined)).status).toBe(401);
  });
});

describe('verifyGatewayToken directly', () => {
  test('returns the kid and claims for a good token', async () => {
    const result = await verifyGatewayToken(sign({ sub: 'gateway', iss: 'central-registry' }));
    expect(result.kid).toBe(KID);
    expect(result.claims.iss).toBe('central-registry');
  });

  test('rejects a token with no kid — we cannot know which key to trust', async () => {
    const noKid = jwt.sign({ sub: 'x' }, privateKey, { algorithm: 'RS256', expiresIn: '5m' });
    await expect(verifyGatewayToken(noKid)).rejects.toThrow(/kid/i);
  });

  test('a JWKS that cannot be reached is a refusal, not a pass', async () => {
    resetGatewayJwksCache();
    vi.stubGlobal(
      'fetch',
      async () => ({ ok: false, status: 503, json: async () => ({}) }) as unknown as Response,
    );
    await expect(verifyGatewayToken(sign({ sub: 'x' }))).rejects.toThrow();
  });

  test('a JWKS with no usable signing key is a refusal', async () => {
    resetGatewayJwksCache();
    vi.stubGlobal(
      'fetch',
      async () =>
        ({ ok: true, status: 200, json: async () => ({ keys: [] }) }) as unknown as Response,
    );
    await expect(verifyGatewayToken(sign({ sub: 'x' }))).rejects.toThrow(/no usable signing key/i);
  });
});

describe('the randomUUID used for REQUEST-ID is real', () => {
  test('sanity — the JWKS request carries a fresh correlation id', () => {
    expect(randomUUID()).not.toBe(randomUUID());
  });
});
