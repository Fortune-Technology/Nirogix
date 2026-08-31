import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, test, vi } from 'vitest';

/**
 * The Fidelius parameter file — what it puts on disk, and that it always takes it away again.
 *
 * `runViaFile` exists because NHA documents `--filepath` as the workaround for a terminal's
 * 8192-character command limit, and every payload we encrypt is a base64 FHIR bundle that clears
 * it. The cost of that fix is that the plaintext bundle and our private key touch the filesystem.
 *
 * These tests do not need the jar, and deliberately so: what they check is the half that is **ours**
 * to get wrong. Fidelius is invoked here with a path that cannot exist, which forces the failing
 * branch — the one that must still clean up, and the one a test written against a working CLI would
 * never reach.
 */

vi.mock('../../../config/env', () => ({
  env: {
    // A path no operating system will resolve, so `execFile` rejects and `finally` has to run.
    FIDELIUS_CLI_PATH: '/nonexistent/fidelius-cli-for-tests',
    ABDM_PROVIDER: 'gateway',
  },
}));

vi.mock('../../../config/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { EncryptionUnavailableError, encryptForHiu, generateKeyPair } from '../cipher';

/** Anything this module left behind in the system temp directory. */
async function strayParameterDirs(): Promise<string[]> {
  const entries = await readdir(tmpdir(), { withFileTypes: true }).catch(() => []);
  return entries.filter((e) => e.isDirectory() && e.name.startsWith('fidelius-')).map((e) => e.name);
}

describe('the Fidelius parameter file', () => {
  test('a failed encryption still refuses, rather than degrading', async () => {
    await expect(
      encryptForHiu({ plaintext: '{"resourceType":"Bundle"}', hiuPublicKey: 'pub', hiuNonce: 'nonce' }),
    ).rejects.toBeInstanceOf(EncryptionUnavailableError);
  });

  test('nothing is left on disk after a failure', async () => {
    const before = await strayParameterDirs();

    // Several failures in a row: a leak would compound, and one attempt could pass by luck.
    for (let i = 0; i < 3; i += 1) {
      await expect(
        encryptForHiu({ plaintext: `{"n":${i}}`, hiuPublicKey: 'pub', hiuNonce: 'nonce' }),
      ).rejects.toBeInstanceOf(EncryptionUnavailableError);
    }

    const after = await strayParameterDirs();
    // The file holds the plaintext bundle AND our private key. A failing transfer must not be the
    // path that leaves both in the system temp directory for whoever looks next.
    expect(after.length).toBe(before.length);
  });

  test('key generation is refused the same way, and writes no file at all', async () => {
    const before = await strayParameterDirs();
    // `gkm` carries no payload and no keys, so it never takes the file path — but it must still
    // fail closed rather than returning a key pair nobody generated.
    await expect(generateKeyPair()).rejects.toBeInstanceOf(EncryptionUnavailableError);
    expect((await strayParameterDirs()).length).toBe(before.length);
  });
});
