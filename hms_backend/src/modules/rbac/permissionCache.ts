// In-memory cache of resolved permission sets (single instance for MVP; a shared Redis cache
// comes with horizontal scaling). Resolution is expensive (several queries), so it is cached and
// invalidated on any role/override/entitlement change — never recomputed per request.

export type CacheEntry = { permissions: Set<string>; wildcard: boolean; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

function keyOf(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`;
}

export function getCached(tenantId: string, userId: string): CacheEntry | undefined {
  const k = keyOf(tenantId, userId);
  const entry = cache.get(k);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(k);
    return undefined;
  }
  return entry;
}

// ADR-010: a cache entry containing temporary overrides must expire no later than the earliest
// `valid_until` among them — the cache is never allowed to outlive the shortest-lived grant.
export function setCached(
  tenantId: string,
  userId: string,
  permissions: Set<string>,
  wildcard: boolean,
  earliestValidUntilMs: number | null,
): void {
  let expiresAt = Date.now() + DEFAULT_TTL_MS;
  if (earliestValidUntilMs !== null) {
    expiresAt = Math.min(expiresAt, earliestValidUntilMs);
  }
  cache.set(keyOf(tenantId, userId), { permissions, wildcard, expiresAt });
}

// ADR-010: setting revoked_at / changing roles must immediately invalidate the affected user.
export function invalidateUser(tenantId: string, userId: string): void {
  cache.delete(keyOf(tenantId, userId));
}

export function invalidateTenant(tenantId: string): void {
  for (const k of cache.keys()) {
    if (k.startsWith(`${tenantId}:`)) cache.delete(k);
  }
}

export function clearAll(): void {
  cache.clear();
}
