import { and, eq, isNull, sql } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { tenantBranding, type TenantBranding } from '../../db/schema';
import { getDownloadUrl } from '../file/file.service';
import { writeAudit } from '../audit/audit.service';

// The organization-wide branding row (branch_id NULL). Branch-level overrides are reserved.
async function getOrgRow(tenantId: string): Promise<TenantBranding | null> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .select()
      .from(tenantBranding)
      .where(and(eq(tenantBranding.tenantId, tenantId), isNull(tenantBranding.branchId)))
      .limit(1),
  );
  return rows[0] ?? null;
}

// Ensures the org branding row exists, returns its id.
async function ensureRow(tenantId: string): Promise<string> {
  const existing = await getOrgRow(tenantId);
  if (existing) return existing.id;
  return runWithTenant(tenantId, async (tx) => {
    const row = (await tx.insert(tenantBranding).values({ tenantId }).returning())[0]!;
    return row.id;
  });
}

export type ResolvedBranding = {
  brandColor: string | null;
  secondaryColor: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  typography: unknown;
};

// The branding the Portal applies at session bootstrap. Logo/favicon file ids are resolved to
// short-lived URLs (re-fetched on each load). Returns nulls when nothing is configured, so the
// Portal falls back to the default `--hms-*` tokens.
export async function getCurrentBranding(tenantId: string): Promise<ResolvedBranding> {
  const row = await getOrgRow(tenantId);
  if (!row) return { brandColor: null, secondaryColor: null, logoUrl: null, faviconUrl: null, typography: null };
  const [logo, favicon] = await Promise.all([
    row.logoFileId ? getDownloadUrl(tenantId, row.logoFileId) : Promise.resolve(null),
    row.faviconFileId ? getDownloadUrl(tenantId, row.faviconFileId) : Promise.resolve(null),
  ]);
  return {
    brandColor: row.brandColor,
    secondaryColor: row.secondaryColor,
    logoUrl: logo?.url ?? null,
    faviconUrl: favicon?.url ?? null,
    typography: row.typography,
  };
}

export async function updateBranding(
  tenantId: string,
  patch: { brandColor?: string | null; secondaryColor?: string | null; typography?: unknown },
  actorUserId?: string,
): Promise<ResolvedBranding> {
  const id = await ensureRow(tenantId);
  await runWithTenant(tenantId, (tx) =>
    tx
      .update(tenantBranding)
      .set({
        ...(patch.brandColor !== undefined ? { brandColor: patch.brandColor } : {}),
        ...(patch.secondaryColor !== undefined ? { secondaryColor: patch.secondaryColor } : {}),
        ...(patch.typography !== undefined ? { typography: patch.typography } : {}),
        version: sql`${tenantBranding.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(tenantBranding.id, id)),
  );
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'branding.update',
    resourceType: 'branding',
    resourceId: id,
    metadata: { brandColor: patch.brandColor ?? null, secondaryColor: patch.secondaryColor ?? null },
  });
  return getCurrentBranding(tenantId);
}

export async function setLogo(tenantId: string, fileId: string, actorUserId?: string): Promise<void> {
  const id = await ensureRow(tenantId);
  await runWithTenant(tenantId, (tx) =>
    tx.update(tenantBranding).set({ logoFileId: fileId, updatedAt: new Date() }).where(eq(tenantBranding.id, id)),
  );
  await writeAudit({ tenantId, actorUserId: actorUserId ?? null, action: 'branding.logo', resourceType: 'branding', resourceId: id });
}

export async function setFavicon(tenantId: string, fileId: string, actorUserId?: string): Promise<void> {
  const id = await ensureRow(tenantId);
  await runWithTenant(tenantId, (tx) =>
    tx.update(tenantBranding).set({ faviconFileId: fileId, updatedAt: new Date() }).where(eq(tenantBranding.id, id)),
  );
  await writeAudit({ tenantId, actorUserId: actorUserId ?? null, action: 'branding.favicon', resourceType: 'branding', resourceId: id });
}

// Reset to the default token palette (clears colours, logo, favicon, typography).
export async function resetBranding(tenantId: string, actorUserId?: string): Promise<void> {
  const row = await getOrgRow(tenantId);
  if (!row) return;
  await runWithTenant(tenantId, (tx) =>
    tx
      .update(tenantBranding)
      .set({
        brandColor: null,
        secondaryColor: null,
        logoFileId: null,
        faviconFileId: null,
        typography: null,
        updatedAt: new Date(),
      })
      .where(eq(tenantBranding.id, row.id)),
  );
  await writeAudit({ tenantId, actorUserId: actorUserId ?? null, action: 'branding.reset', resourceType: 'branding', resourceId: row.id });
}
