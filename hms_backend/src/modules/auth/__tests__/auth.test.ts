import { describe, test, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../password';
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} from '../tokens';

// Pure crypto/token primitives — no database, so these run in every environment.

describe('auth primitives', () => {
  test('password hash round-trips and rejects wrong password', async () => {
    const hash = await hashPassword('S3cret#pw');
    expect(hash).not.toBe('S3cret#pw');
    expect(await verifyPassword('S3cret#pw', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  test('access token round-trips with claims', () => {
    const token = signAccessToken({ sub: 'u1', tid: 't1', roles: ['role.x'] });
    const claims = verifyAccessToken(token);
    expect(claims.sub).toBe('u1');
    expect(claims.tid).toBe('t1');
    expect(claims.roles).toEqual(['role.x']);
  });

  test('refresh token round-trips', () => {
    const token = signRefreshToken({ sub: 'u1', tid: 't1', sid: 's1' });
    expect(verifyRefreshToken(token).sid).toBe('s1');
  });

  test('a tampered/garbage token is rejected', () => {
    expect(() => verifyAccessToken('not-a-jwt')).toThrow();
  });

  test('hashToken is deterministic and collision-resistant', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });
});
