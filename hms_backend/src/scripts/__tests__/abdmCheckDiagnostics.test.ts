import { afterEach, describe, expect, test, vi } from 'vitest';
import { explainFailure } from '../abdm-check';

/**
 * What `abdm:check` tells you when the session call fails.
 *
 * These exist because the diagnostic was wrong twice, and each time it cost somebody real time:
 *
 * 1. It printed "a 401 here is almost always the credential pair" underneath a **403** that was
 *    actually a CDN blocking the host — sending an engineer to check a secret that was fine.
 * 2. It matched on `401` for credential failures, but NHA answers bad credentials with **400**, so
 *    the commonest real failure fell through to an unhelpful "unexpected".
 *
 * A diagnostic that names the wrong cause is worse than no diagnostic. These pin the wording.
 */

function capture(fn: () => void): string {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    lines.push(args.join(' '));
  });
  fn();
  spy.mockRestore();
  return lines.join('\n');
}

afterEach(() => vi.restoreAllMocks());

describe('a CDN edge block', () => {
  const cdnBody =
    '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01"><HTML><H1>403 ERROR</H1>Request blocked</HTML>';

  test('is named as a network block, never as a credential problem', () => {
    const res = new Response(cdnBody, {
      status: 403,
      headers: { server: 'CloudFront', 'x-cache': 'Error from cloudfront' },
    });
    const out = capture(() => explainFailure(res, cdnBody));

    expect(out).toMatch(/NETWORK-level block, not a credential problem/);
    expect(out).toMatch(/CloudFront/);
    // The specific misdirection that cost an afternoon must not reappear.
    expect(out).not.toMatch(/credential pair/);
  });

  test('offers the one-line proof that needs no credentials', () => {
    const res = new Response(cdnBody, { status: 403, headers: { server: 'CloudFront' } });
    const out = capture(() => explainFailure(res, cdnBody));
    // An unauthenticated GET to the bare domain returning 403 settles it in one command.
    expect(out).toMatch(/curl/);
    expect(out).toMatch(/no change to \.env, code or credentials will help/i);
  });

  test('is recognised from the body alone when the CDN sends no server header', () => {
    const res = new Response(cdnBody, { status: 403 });
    expect(capture(() => explainFailure(res, cdnBody))).toMatch(/NETWORK-level block/);
  });
});

describe('a genuine ABDM rejection', () => {
  test('NHA answers bad credentials with 400, and that is treated as credentials', () => {
    // Observed from the real sandbox, not assumed — matching on 401 alone missed this entirely.
    const body = '{"error":{"code":"ABDM-9999: ","message":"Invalid user credentials"}}';
    const res = new Response(body, {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
    const out = capture(() => explainFailure(res, body));

    expect(out).toMatch(/This is the credential pair, not the code/);
    expect(out).toMatch(/ABDM_CLIENT_ID/);
    expect(out).not.toMatch(/NETWORK-level block/);
  });

  test('a 401 is still treated as credentials', () => {
    const body = '{"message":"Unauthorized"}';
    const out = capture(() => explainFailure(new Response(body, { status: 401 }), body));
    expect(out).toMatch(/credential pair/);
  });

  test('a JSON 403 is a missing role, not a network block', () => {
    const body = '{"error":{"code":"ABDM-1000","message":"Forbidden for this client"}}';
    const res = new Response(body, {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
    const out = capture(() => explainFailure(res, body));

    // Same status as the CDN case, opposite cause — which is exactly why the body matters.
    expect(out).toMatch(/lacks a role/);
    expect(out).not.toMatch(/NETWORK-level block/);
  });

  test('a 5xx points at NHA rather than at us', () => {
    const body = 'upstream error';
    expect(capture(() => explainFailure(new Response(body, { status: 502 }), body))).toMatch(/NHA/);
  });
});
