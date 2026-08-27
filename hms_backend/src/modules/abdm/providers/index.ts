import { env } from '../../../config/env';
import type { AbdmProvider } from './types';
import { AbdmGatewayProvider } from './gatewayProvider';
import { AbdmMockProvider } from './mockProvider';

/**
 * Provider selection, made once at first use (ADR-084, ADR-007).
 *
 * `ABDM_PROVIDER` decides; nothing else in the codebase branches on it. The environment guards
 * in `config/env.ts` already refuse `gateway` without credentials, and `AbdmMockProvider`
 * refuses to construct in production, so a misconfiguration fails at boot rather than at a
 * registration counter.
 */

let instance: AbdmProvider | null = null;

export function abdmProvider(): AbdmProvider {
  if (!instance) {
    instance = env.ABDM_PROVIDER === 'gateway' ? new AbdmGatewayProvider() : new AbdmMockProvider();
  }
  return instance;
}

/** Test seam — lets a test install a stub without touching the environment. */
export function __setAbdmProviderForTests(provider: AbdmProvider | null): void {
  instance = provider;
}

export type { AbdmProvider };
