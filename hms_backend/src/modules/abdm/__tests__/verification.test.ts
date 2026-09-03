import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../../../db/client';
import { cleanupTenant, dbReady, makeTenant } from '../../../test-api';
import { grantModule } from '../../entitlement/entitlement.service';
import { upsertFacilityConfig } from '../abdm.service';
import * as svc from '../abdm.service';
import { abdmProvider, __setAbdmProviderForTests, type AbdmProvider } from '../providers';
import { AbdmMockProvider } from '../providers/mockProvider';

/**
 * ABHA verification, as NHA's M1 workbook actually scopes it (ADR-100).
 *
 * The workbook is titled *ABHA Creation **and Verification*** and its second half is eight
 * mandatory `VRFY_ABHA_*` cases. Four of them are two identifiers by two OTP systems, and the
 * pairing is the point: an ABHA number and an ABHA address must each be verifiable by an Aadhaar
 * OTP (`VRFY_ABHA_101`, `_102`) **and** by the ABHA-linked mobile (`VRFY_ABHA_201`, `_202`). Wiring
 * one system per identifier satisfies half of each pair and leaves the other half unrunnable.
 *
 * The address cases additionally live in a different API family — `/v3/phr/web/login/...` — with its
 * own search, its own profile path and its own card path. A token minted there is not accepted by
 * `/v3/profile/account`, so the family has to be carried through every follow-up call. These tests
 * assert on the calls, not only on the outcome, because the outcome looks identical against a mock
 * and diverges only at NHA.
 */

const CODE = 'ABDMVRFY';
const HIP_ID = 'IN0710-VRFY-001';

let ready = false;
let tenantId = '';

/** Records what the service asked the provider for, so a wrong endpoint fails here, not at NHA. */
interface Call {
  method: string;
  args: Record<string, unknown>;
}

function recording(): { provider: AbdmProvider; calls: Call[] } {
  const inner = new AbdmMockProvider();
  const calls: Call[] = [];
  const provider = new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== 'function' || typeof prop !== 'string') return value;
      return (...args: unknown[]) => {
        calls.push({ method: prop, args: (args[0] ?? {}) as Record<string, unknown> });
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  }) as unknown as AbdmProvider;
  return { provider, calls };
}

/** The OTP every mock flow accepts, once the request has actually reached the registry. */
async function otpFor(transactionId: string, calls: Call[]): Promise<string> {
  expect(calls.some((c) => c.method === 'loginRequestOtp')).toBe(true);
  const txn = await pool.query('SELECT txn_id FROM abdm_transactions WHERE id = $1', [
    transactionId,
  ]);
  expect(txn.rows[0]?.txn_id).toBeTruthy();
  return '123456';
}

beforeAll(async () => {
  ready = await dbReady();
  if (!ready) return;
  await cleanupTenant(CODE);
  tenantId = (await makeTenant(CODE)).tenantId;
  await grantModule(tenantId, 'patient');
  await grantModule(tenantId, 'abdm');
  await upsertFacilityConfig(tenantId, {
    hipId: HIP_ID,
    facilityName: 'Verification Test Hospital',
  });
});

afterEach(() => {
  __setAbdmProviderForTests(null);
});

afterAll(async () => {
  if (!ready) return;
  await cleanupTenant(CODE);
});

describe('VRFY_ABHA_201 — ABHA number, OTP on the ABHA-linked mobile', () => {
  test('verifies and returns the profile', async ({ skip }) => {
    if (!ready) return skip();
    const { provider, calls } = recording();
    __setAbdmProviderForTests(provider);

    const started = await svc.startVerification(tenantId, {
      identifierType: 'abha_number',
      identifier: '91-1111-2222-3334',
      consentGiven: true,
    });
    const result = await svc.verifyIdentifierOtp(tenantId, {
      transactionId: started.transactionId,
      otp: await otpFor(started.transactionId, calls),
    });

    expect(result.state).toBe('verified');
    expect(result.prefill.firstName).toBeTruthy();

    // The default route is the ABHA-linked mobile, and the verify half of the pair matches it.
    const request = calls.find((c) => c.method === 'loginRequestOtp')!;
    expect(request.args.otpSystem).toBe('abdm');
    expect(request.args.family).toBe('profile');
    expect(calls.find((c) => c.method === 'loginVerify')!.args.scope).toEqual([
      'abha-login',
      'mobile-verify',
    ]);
  });
});

describe('VRFY_ABHA_101 — ABHA number, OTP from UIDAI', () => {
  test('requests and verifies on the Aadhaar route', async ({ skip }) => {
    if (!ready) return skip();
    const { provider, calls } = recording();
    __setAbdmProviderForTests(provider);

    const started = await svc.startVerification(tenantId, {
      identifierType: 'abha_number',
      identifier: '91-1111-2222-3336',
      consentGiven: true,
      otpSystem: 'aadhaar',
    });
    const request = calls.find((c) => c.method === 'loginRequestOtp')!;
    expect(request.args.otpSystem).toBe('aadhaar');
    // Still an ABHA-number login: the identifier hint does not change with the OTP system.
    expect(request.args.loginHint).toBe('abha-number');

    const result = await svc.verifyIdentifierOtp(tenantId, {
      transactionId: started.transactionId,
      otp: await otpFor(started.transactionId, calls),
    });
    expect(result.state).toBe('verified');

    // The pair NHA expects. Sending `mobile-verify` after an Aadhaar OTP is rejected at the
    // registry, and the transaction is the only thing that remembers which route was taken.
    expect(calls.find((c) => c.method === 'loginVerify')!.args.scope).toEqual([
      'abha-login',
      'aadhaar-verify',
    ]);
  });

  test('the Aadhaar route is not mistaken for an Aadhaar-keyed lookup', async ({ skip }) => {
    if (!ready) return skip();
    const { provider } = recording();
    __setAbdmProviderForTests(provider);
    const started = await svc.startVerification(tenantId, {
      identifierType: 'abha_number',
      identifier: '91-1111-2222-3337',
      consentGiven: true,
      otpSystem: 'aadhaar',
    });
    const row = await pool.query('SELECT flow FROM abdm_transactions WHERE id = $1', [
      started.transactionId,
    ]);
    expect(row.rows[0].flow).toBe('login_abha_number_aadhaar');
  });
});

describe('VRFY_ABHA_202 — ABHA address, OTP on the ABHA-linked mobile', () => {
  test('searches the address, then completes from the PHR profile path', async ({ skip }) => {
    if (!ready) return skip();
    const { provider, calls } = recording();
    __setAbdmProviderForTests(provider);

    const started = await svc.startVerification(tenantId, {
      identifierType: 'abha_address',
      identifier: 'ramesh1234@sbx',
      consentGiven: true,
    });
    // The workbook lists the search FIRST, before any OTP leaves.
    const order = calls.map((c) => c.method);
    expect(order.indexOf('phrSearchAuthMethods')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('phrSearchAuthMethods')).toBeLessThan(order.indexOf('loginRequestOtp'));
    expect(started.authMethods).toContain('MOBILE_OTP');

    const result = await svc.verifyIdentifierOtp(tenantId, {
      transactionId: started.transactionId,
      otp: await otpFor(started.transactionId, calls),
    });
    expect(result.state).toBe('verified');
    expect(result.prefill.firstName).toBeTruthy();

    // Every PHR-family call carries the family. `loginVerify` there answers with a token and no
    // demographics, so the profile is a second call — to the PHR path, never `/v3/profile/account`.
    expect(calls.find((c) => c.method === 'loginRequestOtp')!.args.family).toBe('phr');
    expect(calls.find((c) => c.method === 'loginVerify')!.args.family).toBe('phr');
    expect(calls.find((c) => c.method === 'getProfile')!.args.family).toBe('phr');
  });
});

describe('VRFY_ABHA_102 — ABHA address, OTP from UIDAI', () => {
  test('verifies on the Aadhaar route within the PHR family', async ({ skip }) => {
    if (!ready) return skip();
    const { provider, calls } = recording();
    __setAbdmProviderForTests(provider);

    const started = await svc.startVerification(tenantId, {
      identifierType: 'abha_address',
      identifier: 'sunita5678@sbx',
      consentGiven: true,
      otpSystem: 'aadhaar',
    });
    const result = await svc.verifyIdentifierOtp(tenantId, {
      transactionId: started.transactionId,
      otp: await otpFor(started.transactionId, calls),
    });
    expect(result.state).toBe('verified');
    expect(calls.find((c) => c.method === 'loginRequestOtp')!.args.otpSystem).toBe('aadhaar');
    expect(calls.find((c) => c.method === 'loginVerify')!.args.scope).toEqual([
      'abha-address-login',
      'aadhaar-verify',
    ]);
  });
});

describe('the address search is a gate, not a formality', () => {
  test('an address the registry does not hold never sends an OTP', async ({ skip }) => {
    if (!ready) return skip();
    const { provider, calls } = recording();
    __setAbdmProviderForTests(provider);

    await expect(
      svc.startVerification(tenantId, {
        identifierType: 'abha_address',
        identifier: 'unknown9999@sbx',
        consentGiven: true,
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'ABDM_ABHA_ADDRESS_NOT_FOUND' });
    expect(calls.some((c) => c.method === 'loginRequestOtp')).toBe(false);
  });

  test('an OTP system the identifier does not support is refused by name', async ({ skip }) => {
    if (!ready) return skip();
    const { provider, calls } = recording();
    __setAbdmProviderForTests(provider);

    // A mobile number is verified by an OTP to that mobile; there is no Aadhaar route for it.
    await expect(
      svc.startVerification(tenantId, {
        identifierType: 'mobile',
        identifier: '9700020001',
        consentGiven: true,
        otpSystem: 'aadhaar',
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'ABDM_OTP_SYSTEM_UNSUPPORTED' });
    expect(calls.some((c) => c.method === 'loginRequestOtp')).toBe(false);
  });
});

describe('CRT_ABHA_114 / VRFY — the ABHA card follows the family that issued the token', () => {
  test('an address-verified holder downloads from the PHR card path', async ({ skip }) => {
    if (!ready) return skip();
    const { provider, calls } = recording();
    __setAbdmProviderForTests(provider);

    const started = await svc.startVerification(tenantId, {
      identifierType: 'abha_address',
      identifier: 'kavita2468@sbx',
      consentGiven: true,
    });
    await svc.verifyIdentifierOtp(tenantId, {
      transactionId: started.transactionId,
      otp: await otpFor(started.transactionId, calls),
    });

    const card = await svc.downloadAbhaCard(tenantId, started.transactionId);
    expect(card.data.length).toBeGreaterThan(0);
    expect(calls.find((c) => c.method === 'getAbhaCard')!.args.family).toBe('phr');
  });

  test('a number-verified holder downloads from the profile card path', async ({ skip }) => {
    if (!ready) return skip();
    const { provider, calls } = recording();
    __setAbdmProviderForTests(provider);

    const started = await svc.startVerification(tenantId, {
      identifierType: 'abha_number',
      identifier: '91-1111-2222-3344',
      consentGiven: true,
    });
    await svc.verifyIdentifierOtp(tenantId, {
      transactionId: started.transactionId,
      otp: await otpFor(started.transactionId, calls),
    });

    await svc.downloadAbhaCard(tenantId, started.transactionId);
    expect(calls.find((c) => c.method === 'getAbhaCard')!.args.family).toBe('profile');
  });
});

describe('VRFY_ABHA_301 / _401 — a malformed identifier is refused here, not at the registry', () => {
  test('an invalid mobile number gets the message NHA asks for', async ({ skip }) => {
    if (!ready) return skip();
    const { provider, calls } = recording();
    __setAbdmProviderForTests(provider);

    await expect(
      svc.startVerification(tenantId, {
        identifierType: 'mobile',
        identifier: '12345',
        consentGiven: true,
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'ABDM_INVALID_MOBILE' });
    // The point of the case is that nothing reached ABDM: a national service is not a validator.
    expect(calls.length).toBe(0);
  });

  test('an invalid Aadhaar number is refused before any OTP', async ({ skip }) => {
    if (!ready) return skip();
    const { provider, calls } = recording();
    __setAbdmProviderForTests(provider);

    await expect(
      svc.startVerification(tenantId, {
        identifierType: 'aadhaar',
        identifier: '1234',
        consentGiven: true,
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'ABDM_INVALID_AADHAAR' });
    expect(calls.length).toBe(0);
  });

  test('an ABHA number that is not 14 digits is refused', async ({ skip }) => {
    if (!ready) return skip();
    const { provider } = recording();
    __setAbdmProviderForTests(provider);

    await expect(
      svc.startVerification(tenantId, {
        identifierType: 'abha_number',
        identifier: '91-1111-2222',
        consentGiven: true,
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'ABDM_INVALID_ABHA_NUMBER' });
  });
});

describe('VRFY_ABHA_305 / _405 — resend, on a verification and not only on an enrolment', () => {
  test('resending repeats the login request, not the enrolment mobile-update call', async ({
    skip,
  }) => {
    if (!ready) return skip();
    const { provider, calls } = recording();
    __setAbdmProviderForTests(provider);

    const started = await svc.startVerification(tenantId, {
      identifierType: 'mobile',
      identifier: '9700030002',
      consentGiven: true,
    });
    const before = calls.filter((c) => c.method === 'loginRequestOtp').length;

    const again = await svc.resendOtp(tenantId, {
      transactionId: started.transactionId,
      identifier: '9700030002',
    });
    expect(again.resendsLeft).toBeGreaterThanOrEqual(0);

    // A second `loginRequestOtp`. `enrolMobileRequestOtp` is a different endpoint on a different
    // flow, and hitting it here would hand back a transaction this verification cannot verify.
    expect(calls.filter((c) => c.method === 'loginRequestOtp').length).toBe(before + 1);
    expect(calls.some((c) => c.method === 'enrolMobileRequestOtp')).toBe(false);
  });

  test('a second resend inside sixty seconds is refused', async ({ skip }) => {
    if (!ready) return skip();
    const { provider } = recording();
    __setAbdmProviderForTests(provider);

    const started = await svc.startVerification(tenantId, {
      identifierType: 'mobile',
      identifier: '9700030003',
      consentGiven: true,
    });
    await svc.resendOtp(tenantId, {
      transactionId: started.transactionId,
      identifier: '9700030003',
    });
    await expect(
      svc.resendOtp(tenantId, { transactionId: started.transactionId, identifier: '9700030003' }),
    ).rejects.toMatchObject({ statusCode: 429, code: 'ABDM_OTP_TOO_SOON' });
  });

  test('a resend with nothing to resend to is refused rather than guessed', async ({ skip }) => {
    if (!ready) return skip();
    const { provider } = recording();
    __setAbdmProviderForTests(provider);

    const started = await svc.startVerification(tenantId, {
      identifierType: 'abha_number',
      identifier: '91-1111-2222-3346',
      consentGiven: true,
    });
    await expect(
      svc.resendOtp(tenantId, { transactionId: started.transactionId }),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: 'ABDM_RESEND_NEEDS_IDENTIFIER',
    });
  });
});

describe('VRFY_ABHA_304 / _402 — an incorrect OTP fails the verification', () => {
  test('the transaction is marked failed and the caller is told', async ({ skip }) => {
    if (!ready) return skip();
    const { provider } = recording();
    __setAbdmProviderForTests(provider);

    const started = await svc.startVerification(tenantId, {
      identifierType: 'abha_number',
      identifier: '91-1111-2222-3347',
      consentGiven: true,
    });
    await expect(
      svc.verifyIdentifierOtp(tenantId, { transactionId: started.transactionId, otp: '000000' }),
    ).rejects.toThrow(/incorrect|expired/i);

    const row = await pool.query('SELECT state FROM abdm_transactions WHERE id = $1', [
      started.transactionId,
    ]);
    expect(row.rows[0].state).toBe('failed');
  });
});

describe('VRFY_ABHA_302 / _403 — no ABHA against this identifier is an answer, not a failure', () => {
  test('the refusal is a 404 that says an ABHA can be created instead', async ({ skip }) => {
    if (!ready) return skip();
    const { provider, calls } = recording();
    // A registry that verifies the OTP and then reports no account at all — the shape NHA's own
    // case describes, and the one the mock never produces on its own.
    const empty = new Proxy(provider, {
      get(target, prop, receiver) {
        if (prop !== 'loginVerify') return Reflect.get(target, prop, receiver);
        return async (input: { txnId: string }) => {
          calls.push({ method: 'loginVerify', args: input as unknown as Record<string, unknown> });
          return {
            txnId: input.txnId,
            tokens: { xToken: '', linkingToken: '' },
            accounts: [],
            profile: undefined,
          };
        };
      },
    }) as unknown as AbdmProvider;
    __setAbdmProviderForTests(empty);

    const started = await svc.startVerification(tenantId, {
      identifierType: 'mobile',
      identifier: '9700040004',
      consentGiven: true,
    });
    await expect(
      svc.verifyIdentifierOtp(tenantId, { transactionId: started.transactionId, otp: '123456' }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'ABDM_NO_ABHA_FOUND' });
  });
});
describe('the provider seam is restored between tests', () => {
  test('the module-level provider is the configured one again', () => {
    expect(abdmProvider()).toBeInstanceOf(AbdmMockProvider);
  });
});
