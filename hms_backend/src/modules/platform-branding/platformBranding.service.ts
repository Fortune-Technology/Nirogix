import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { platformBranding, tenants, type PlatformBrandingRow } from '../../db/schema';
import { getDownloadUrl } from '../file/file.service';
import { writeAudit } from '../audit/audit.service';

// Local types (the backend defines its own; @hms/types mirrors this shape for the frontends).
export type PlatformBrandingScope = 'marketing' | 'hms';
export type BrandingTokens = Record<string, string>;
export interface ResolvedPlatformBranding {
  scope: PlatformBrandingScope;
  tokens: BrandingTokens;
  logoUrl: string | null;
  faviconUrl: string | null;
  version: number;
}

// Platform branding is PLATFORM-GLOBAL (ADR-024): no tenant_id, so it is read/written through the
// base `db` client, never `runWithTenant`. Branding assets (logo/favicon) are stored under the
// PLATFORM tenant so the existing tenant-scoped FileStorageService works unchanged; asset URLs are
// resolved with that tenant id even on the unauthenticated public read.

// The PLATFORM org's tenant id (ADR-022), used for asset storage + audit.
export async function platformTenantId(): Promise<string> {
  const rows = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.code, 'NIROGIX')).limit(1);
  const id = rows[0]?.id;
  if (!id) throw new Error('PLATFORM tenant not found (run db:seed)');
  return id;
}

async function getRow(scope: PlatformBrandingScope): Promise<PlatformBrandingRow | null> {
  const rows = await db.select().from(platformBranding).where(eq(platformBranding.scope, scope)).limit(1);
  return rows[0] ?? null;
}

async function ensureRow(scope: PlatformBrandingScope): Promise<void> {
  const existing = await getRow(scope);
  if (existing) return;
  await db.insert(platformBranding).values({ scope }).onConflictDoNothing();
}

// The resolved branding a surface applies. Nulls/empty mean "use the built-in default tokens".
export async function getPlatformBranding(scope: PlatformBrandingScope): Promise<ResolvedPlatformBranding> {
  const row = await getRow(scope);
  if (!row) return { scope, tokens: {}, logoUrl: null, faviconUrl: null, version: 0 };

  let logoUrl: string | null = null;
  let faviconUrl: string | null = null;
  if (row.logoFileId || row.faviconFileId) {
    const tid = await platformTenantId();
    // Rendered in an <img>/<link>, so served inline rather than as a forced download.
    const [logo, favicon] = await Promise.all([
      row.logoFileId ? getDownloadUrl(tid, row.logoFileId, { disposition: 'inline' }) : Promise.resolve(null),
      row.faviconFileId ? getDownloadUrl(tid, row.faviconFileId, { disposition: 'inline' }) : Promise.resolve(null),
    ]);
    logoUrl = logo?.url ?? null;
    faviconUrl = favicon?.url ?? null;
  }

  return {
    scope: row.scope,
    tokens: (row.tokens ?? {}) as BrandingTokens,
    logoUrl,
    faviconUrl,
    version: row.version,
  };
}

export async function updatePlatformBranding(
  scope: PlatformBrandingScope,
  tokens: BrandingTokens,
  actorUserId?: string,
): Promise<ResolvedPlatformBranding> {
  await ensureRow(scope);
  await db
    .update(platformBranding)
    .set({ tokens: tokens as Record<string, string>, version: sql`${platformBranding.version} + 1`, updatedAt: new Date() })
    .where(eq(platformBranding.scope, scope));
  await writeAudit({
    tenantId: await platformTenantId(),
    actorUserId: actorUserId ?? null,
    action: 'platform_branding.update',
    resourceType: 'platform_branding',
    resourceId: scope,
    metadata: { scope, tokens },
  });
  return getPlatformBranding(scope);
}

export async function setPlatformLogo(scope: PlatformBrandingScope, fileId: string, actorUserId?: string): Promise<void> {
  await ensureRow(scope);
  await db.update(platformBranding).set({ logoFileId: fileId, updatedAt: new Date() }).where(eq(platformBranding.scope, scope));
  await writeAudit({
    tenantId: await platformTenantId(),
    actorUserId: actorUserId ?? null,
    action: 'platform_branding.logo',
    resourceType: 'platform_branding',
    resourceId: scope,
    metadata: { scope },
  });
}

export async function setPlatformFavicon(scope: PlatformBrandingScope, fileId: string, actorUserId?: string): Promise<void> {
  await ensureRow(scope);
  await db.update(platformBranding).set({ faviconFileId: fileId, updatedAt: new Date() }).where(eq(platformBranding.scope, scope));
  await writeAudit({
    tenantId: await platformTenantId(),
    actorUserId: actorUserId ?? null,
    action: 'platform_branding.favicon',
    resourceType: 'platform_branding',
    resourceId: scope,
    metadata: { scope },
  });
}

export async function resetPlatformBranding(scope: PlatformBrandingScope, actorUserId?: string): Promise<ResolvedPlatformBranding> {
  const row = await getRow(scope);
  if (row) {
    await db
      .update(platformBranding)
      .set({ tokens: {}, logoFileId: null, faviconFileId: null, version: sql`${platformBranding.version} + 1`, updatedAt: new Date() })
      .where(eq(platformBranding.scope, scope));
    await writeAudit({
      tenantId: await platformTenantId(),
      actorUserId: actorUserId ?? null,
      action: 'platform_branding.reset',
      resourceType: 'platform_branding',
      resourceId: scope,
      metadata: { scope },
    });
  }
  return getPlatformBranding(scope);
}
