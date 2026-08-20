import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { runWithTenant } from '../../db/tenantContext';
import { organizationProfile, tenants, type OrganizationProfile } from '../../db/schema';
import { getDownloadUrl } from '../file/file.service';
import { writeAudit } from '../audit/audit.service';
import type { UpdateOrganizationProfileInput } from './organization.schema';

/**
 * The hospital's own identity (ADR-049). Reads and writes go through `runWithTenant`, so RLS
 * scopes every statement to the caller's tenant — a hospital cannot read or write another's
 * registered address, phone or GSTIN even if an id were guessed.
 */

export type ResolvedOrganizationProfile = {
  name: string;
  code: string;
  legalName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  registrationNumber: string | null;
  gstin: string | null;
  displayName: string | null;
  secondaryPhone: string | null;
  supportEmail: string | null;
  letterheadHeader: string | null;
  letterheadFooter: string | null;
  signatoryName: string | null;
  signatoryDesignation: string | null;
  letterheadImageUrl: string | null;
  documentPageSize: string | null;
  contactLines: string[];
  isComplete: boolean;
};

/** The fields a tax invoice header legally needs before the profile counts as configured. */
const REQUIRED_FOR_DOCUMENTS = ['addressLine1', 'city', 'state', 'postalCode', 'phone'] as const;

async function getTenantRow(tenantId: string): Promise<{ name: string; code: string }> {
  const rows = await db.select({ name: tenants.name, code: tenants.code }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const row = rows[0];
  return { name: row?.name ?? '', code: row?.code ?? '' };
}

async function getRow(tenantId: string): Promise<OrganizationProfile | null> {
  const rows = await runWithTenant(tenantId, (tx) =>
    tx.select().from(organizationProfile).where(eq(organizationProfile.tenantId, tenantId)).limit(1),
  );
  return rows[0] ?? null;
}

/**
 * Address / contact lines in the order a document header prints them. Only lines with content
 * are produced — a document shows what is configured and omits the rest rather than printing
 * an empty label or an invented placeholder.
 */
export function buildContactLines(p: Partial<OrganizationProfile>): string[] {
  const lines: string[] = [];
  const street = [p.addressLine1, p.addressLine2].filter(Boolean).join(', ');
  if (street) lines.push(street);
  const locality = [p.city, p.state, p.postalCode].filter(Boolean).join(', ');
  if (locality) lines.push([locality, p.country].filter(Boolean).join(', '));
  else if (p.country) lines.push(p.country);
  const phones = [p.phone, p.secondaryPhone].filter(Boolean).join(' / ');
  const reach = [phones && `Tel ${phones}`, p.email, p.website].filter(Boolean).join(' · ');
  if (reach) lines.push(reach);
  const statutory = [
    p.registrationNumber && `Reg. no. ${p.registrationNumber}`,
    p.gstin && `GSTIN ${p.gstin}`,
  ].filter(Boolean).join(' · ');
  if (statutory) lines.push(statutory);
  return lines;
}

export async function getOrganizationProfile(tenantId: string): Promise<ResolvedOrganizationProfile> {
  const [tenant, row] = await Promise.all([getTenantRow(tenantId), getRow(tenantId)]);
  const p = row ?? {};
  // The stored file id is resolved to a short-lived URL on every read, exactly like the
  // branding logo — the id never leaves the server, and a stale URL cannot be replayed.
  const letterheadImage = row?.letterheadImageFileId
    ? await getDownloadUrl(tenantId, row.letterheadImageFileId, { disposition: 'inline' })
    : null;
  return {
    name: tenant.name,
    code: tenant.code,
    legalName: row?.legalName ?? null,
    addressLine1: row?.addressLine1 ?? null,
    addressLine2: row?.addressLine2 ?? null,
    city: row?.city ?? null,
    state: row?.state ?? null,
    postalCode: row?.postalCode ?? null,
    country: row?.country ?? null,
    phone: row?.phone ?? null,
    email: row?.email ?? null,
    website: row?.website ?? null,
    registrationNumber: row?.registrationNumber ?? null,
    gstin: row?.gstin ?? null,
    displayName: row?.displayName ?? null,
    secondaryPhone: row?.secondaryPhone ?? null,
    supportEmail: row?.supportEmail ?? null,
    letterheadHeader: row?.letterheadHeader ?? null,
    letterheadFooter: row?.letterheadFooter ?? null,
    signatoryName: row?.signatoryName ?? null,
    signatoryDesignation: row?.signatoryDesignation ?? null,
    letterheadImageUrl: letterheadImage?.url ?? null,
    documentPageSize: row?.documentPageSize ?? null,
    contactLines: buildContactLines(p),
    isComplete: REQUIRED_FOR_DOCUMENTS.every((f) => Boolean(row?.[f])),
  };
}

// An empty string means "cleared"; `undefined` means "not sent, leave as it is".
function normalise(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

export async function updateOrganizationProfile(
  tenantId: string,
  input: UpdateOrganizationProfileInput,
  actorUserId: string,
): Promise<ResolvedOrganizationProfile> {
  const patch: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(input)) {
    const v = normalise(value as string | null | undefined);
    if (v !== undefined) patch[key] = v;
  }

  await runWithTenant(tenantId, async (tx) => {
    const existing = await tx
      .select({ id: organizationProfile.id })
      .from(organizationProfile)
      .where(eq(organizationProfile.tenantId, tenantId))
      .limit(1);

    if (existing[0]) {
      await tx
        .update(organizationProfile)
        .set({ ...patch, version: sql`${organizationProfile.version} + 1`, updatedAt: new Date() })
        .where(eq(organizationProfile.tenantId, tenantId));
    } else {
      await tx.insert(organizationProfile).values({ tenantId, ...patch });
    }
  });

  // The hospital's legal identity is exactly the kind of configuration change that must be
  // attributable later — it changes what every future invoice claims about the supplier.
  await writeAudit({
    tenantId,
    actorUserId,
    action: 'organization.profile.update',
    severity: 'info',
    resourceType: 'organization_profile',
    resourceId: tenantId,
    metadata: { fields: Object.keys(patch) },
  });

  return getOrganizationProfile(tenantId);
}

// Insert-or-update the profile row with a single letterhead-image patch. Mirrors the
// upsert in `updateOrganizationProfile`: a hospital that has never opened Hospital
// information can still set its letterhead first (ADR-065).
async function upsertLetterheadImage(tenantId: string, fileId: string | null): Promise<void> {
  await runWithTenant(tenantId, async (tx) => {
    const existing = await tx
      .select({ id: organizationProfile.id })
      .from(organizationProfile)
      .where(eq(organizationProfile.tenantId, tenantId))
      .limit(1);
    if (existing[0]) {
      await tx
        .update(organizationProfile)
        .set({ letterheadImageFileId: fileId, version: sql`${organizationProfile.version} + 1`, updatedAt: new Date() })
        .where(eq(organizationProfile.tenantId, tenantId));
    } else {
      await tx.insert(organizationProfile).values({ tenantId, letterheadImageFileId: fileId });
    }
  });
}

export async function setLetterheadImage(
  tenantId: string,
  fileId: string,
  actorUserId: string,
): Promise<ResolvedOrganizationProfile> {
  await upsertLetterheadImage(tenantId, fileId);
  await writeAudit({
    tenantId,
    actorUserId,
    action: 'organization.letterhead.image',
    severity: 'info',
    resourceType: 'organization_profile',
    resourceId: tenantId,
    metadata: { fileId },
  });
  return getOrganizationProfile(tenantId);
}

export async function clearLetterheadImage(
  tenantId: string,
  actorUserId: string,
): Promise<ResolvedOrganizationProfile> {
  // The file id is dropped from the profile; the file itself soft-deletes and is retained
  // for audit, so removing a letterhead never destroys the record that it once existed.
  await upsertLetterheadImage(tenantId, null);
  await writeAudit({
    tenantId,
    actorUserId,
    action: 'organization.letterhead.image.remove',
    severity: 'notice',
    resourceType: 'organization_profile',
    resourceId: tenantId,
  });
  return getOrganizationProfile(tenantId);
}
