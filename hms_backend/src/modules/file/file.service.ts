import { randomUUID, createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { fileMetadata, type FileMetadata } from '../../db/schema';
import { env } from '../../config/env';
import { getFileStorageProvider } from './providers';
import { signFileToken } from './fileToken';
import { writeAudit } from '../audit/audit.service';

export type UploadInput = {
  tenantId: string;
  uploadedBy?: string;
  filename: string;
  contentType: string;
  size: number;
  buffer: Buffer;
};

function sanitizeFilename(name: string): string {
  return (name || 'file').replace(/[^\w.\-]/g, '_').slice(0, 200);
}

export async function uploadFile(input: UploadInput): Promise<FileMetadata> {
  const provider = getFileStorageProvider();
  const safe = sanitizeFilename(input.filename);
  const storageKey = `${input.tenantId}/${randomUUID()}-${safe}`;
  const checksum = createHash('sha256').update(input.buffer).digest('hex');

  await provider.putObject(storageKey, input.buffer, input.contentType);

  const meta = await runWithTenant(input.tenantId, async (tx) => {
    const rows = await tx
      .insert(fileMetadata)
      .values({
        tenantId: input.tenantId,
        storageKey,
        filename: safe,
        contentType: input.contentType,
        size: input.size,
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
    metadata: { filename: safe, size: input.size, checksum, provider: provider.name },
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
