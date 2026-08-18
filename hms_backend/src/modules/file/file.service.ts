import { randomUUID, createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { fileMetadata, type FileMetadata } from '../../db/schema';
import { env } from '../../config/env';
import { getFileStorageProvider } from './providers';
import { signFileToken } from './fileToken';
import { optimizeImage } from './imageOptimize';
import { writeAudit } from '../audit/audit.service';

export type UploadInput = {
  tenantId: string;
  uploadedBy?: string;
  filename: string;
  contentType: string;
  size: number;
  buffer: Buffer;
  /**
   * Storage category — the folder an object lands in, under its tenant (ADR-007). Keeps the
   * bucket browsable and lets ops apply per-category lifecycle rules. Whitelisted to a safe
   * slug; anything unknown falls back to `documents`. Only genuine uploads live here —
   * invoices and clinical reports are generated print routes, not stored files.
   */
  category?: FileCategory;
};

/** The folders an upload can land in. Add one here before a call site uses it. */
export type FileCategory =
  | 'branding'
  | 'platform-branding'
  | 'letterhead'
  | 'lab-reports'
  | 'documents';

const FILE_CATEGORIES: readonly FileCategory[] = [
  'branding',
  'platform-branding',
  'letterhead',
  'lab-reports',
  'documents',
];

/** Never trust a category string into a storage key — whitelist it, default `documents`. */
export function resolveCategory(value?: string): FileCategory {
  return (FILE_CATEGORIES as readonly string[]).includes(value ?? '') ? (value as FileCategory) : 'documents';
}

function sanitizeFilename(name: string): string {
  return (name || 'file').replace(/[^\w.\-]/g, '_').slice(0, 200);
}

export async function uploadFile(input: UploadInput): Promise<FileMetadata> {
  const provider = getFileStorageProvider();

  // Optimize images before anything else touches the bytes — the stored object's size, checksum,
  // filename and content type all reflect the optimized result. Non-raster / non-image inputs
  // (PDF, SVG, GIF) pass through unchanged.
  const opt = await optimizeImage(input.buffer, input.contentType, input.filename);
  const buffer = opt.buffer;
  const contentType = opt.contentType;
  const size = buffer.length;
  const safe = sanitizeFilename(opt.filename);

  // <tenantId>/<category>/<uuid>-<filename> — tenant-isolated first (RLS is the real boundary;
  // this mirrors it in the key), then foldered by what the file is.
  const folder = resolveCategory(input.category);
  const storageKey = `${input.tenantId}/${folder}/${randomUUID()}-${safe}`;
  const checksum = createHash('sha256').update(buffer).digest('hex');

  await provider.putObject(storageKey, buffer, contentType);

  const meta = await runWithTenant(input.tenantId, async (tx) => {
    const rows = await tx
      .insert(fileMetadata)
      .values({
        tenantId: input.tenantId,
        storageKey,
        filename: safe,
        contentType,
        size,
        checksum,
        uploadedBy: input.uploadedBy ?? null,
      })
      .returning();
    return rows[0]!;
  });

  await writeAudit({
    tenantId: input.tenantId,
    actorUserId: input.uploadedBy ?? null,
    action: 'file.upload',
    resourceType: 'file',
    resourceId: meta.id,
    metadata: { filename: safe, size, originalSize: input.size, optimized: opt.optimized, checksum, provider: provider.name },
  });
  return meta;
}

export async function getFileMetadata(tenantId: string, id: string): Promise<FileMetadata | null> {
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(fileMetadata)
      .where(and(eq(fileMetadata.tenantId, tenantId), eq(fileMetadata.id, id)))
      .limit(1);
    const m = rows[0];
    return m && m.status !== 'deleted' ? m : null;
  });
}

// Returns a short-lived download URL: a provider-native signed URL (S3), or the app's tokenized
// content route (local).
export async function getDownloadUrl(
  tenantId: string,
  id: string,
): Promise<{ url: string; expiresInSeconds: number } | null> {
  const meta = await getFileMetadata(tenantId, id);
  if (!meta) return null;
  const provider = getFileStorageProvider();
  const signed = await provider.getSignedDownloadUrl(meta.storageKey, meta.filename);
  if (signed) return { url: signed, expiresInSeconds: 600 };

  const token = signFileToken(meta.id, tenantId);
  const base = env.API_PUBLIC_URL ?? `http://localhost:${env.PORT}`;
  return {
    url: `${base}/api/v1/files/content/${meta.id}?token=${token}`,
    expiresInSeconds: 600,
  };
}

// Fetches object bytes for the app-served content route (local provider). Audits the access —
// reading a PHI-bearing document is a logged event.
export async function getFileContent(
  tenantId: string,
  id: string,
): Promise<{ meta: FileMetadata; body: Buffer } | null> {
  const meta = await getFileMetadata(tenantId, id);
  if (!meta) return null;
  const provider = getFileStorageProvider();
  const body = await provider.getObject(meta.storageKey);
  await writeAudit({ tenantId, action: 'file.download', resourceType: 'file', resourceId: id });
  return { meta, body };
}

// Soft-deletes the metadata (retained for audit) and removes the object from storage.
export async function deleteFile(
  tenantId: string,
  id: string,
  actorUserId?: string,
): Promise<boolean> {
  const meta = await getFileMetadata(tenantId, id);
  if (!meta) return false;
  const provider = getFileStorageProvider();
  await provider.deleteObject(meta.storageKey).catch(() => {
    /* best-effort object removal; metadata is still marked deleted + audited */
  });
  await runWithTenant(tenantId, (tx) =>
    tx
      .update(fileMetadata)
      .set({ status: 'deleted', deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(fileMetadata.id, id)),
  );
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'file.delete',
    resourceType: 'file',
    resourceId: id,
    severity: 'notice',
  });
  return true;
}
