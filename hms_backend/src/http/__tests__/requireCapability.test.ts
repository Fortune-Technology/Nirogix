import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

// Unit-test the middleware in isolation — the entitlement lookup is mocked, so no DB is touched.
vi.mock('../../modules/entitlement/capability.service', () => ({
  isCapabilityEntitled: vi.fn(),
}));

import { requireCapability } from '../requireCapability';
import { isCapabilityEntitled } from '../../modules/entitlement/capability.service';

const mocked = vi.mocked(isCapabilityEntitled);

function run(auth: { tenantId: string } | undefined): Promise<unknown> {
  const req = { auth } as unknown as Request;
  const res = {} as Response;
  return new Promise((resolve) => {
    const next: NextFunction = (err?: unknown) => resolve(err);
    void requireCapability('billing', 'billing.services')(req, res, next);
  });
}

describe('requireCapability middleware', () => {
  beforeEach(() => mocked.mockReset());

  test('no session → UNAUTHORIZED, entitlement never consulted', async () => {
    const err = (await run(undefined)) as { code: string };
    expect(err.code).toBe('UNAUTHORIZED');
    expect(mocked).not.toHaveBeenCalled();
  });

  test('capability enabled → passes (next with no error)', async () => {
    mocked.mockResolvedValue(true);
    expect(await run({ tenantId: 't1' })).toBeUndefined();
    expect(mocked).toHaveBeenCalledWith('t1', 'billing', 'billing.services');
  });

  test('capability disabled → CAPABILITY_NOT_ENTITLED (403)', async () => {
    mocked.mockResolvedValue(false);
    const err = (await run({ tenantId: 't1' })) as { code: string; statusCode: number };
    expect(err.code).toBe('CAPABILITY_NOT_ENTITLED');
    expect(err.statusCode).toBe(403);
  });
});
