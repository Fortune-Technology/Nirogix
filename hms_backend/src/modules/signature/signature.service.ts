import { and, desc, eq, inArray } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { userSignatures, users, type UserSignature } from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';
import { uploadFile, getDownloadUrl, type UploadInput } from '../file/file.service';

/**
 * A person's electronic signature, and the versions of it (ADR-137).
 *
 * **Electronic, not cryptographic.** Everything here handles an image somebody uploaded and
 * renders it onto a generated document. Nothing signs a hash, nothing is tamper-evident, and no
 * certificate authority is involved. The product must never describe it as a legally certified
 * digital signature, and this file is the place that claim would have to start from.
 *
 * Two rules do the real work:
 *
 * 1. **Only your own.** Every function takes the *authenticated* user id. There is no parameter
 *    for whose signature to change, so an administrator holding every permission in the system
 *    still cannot upload one in a clinician's name — not because a check refuses them, but
 *    because the operation cannot be expressed.
 * 2. **Versions, never edits.** Uploading again writes a new row and retires the old one. A
 *    document stores the version id that signed it, so changing your signature changes what
 *    future documents show and nothing else.
 */

/** The image formats a signature may be. Narrow on purpose — this is rendered into documents. */
const ALLOWED_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];
/** A signature is a small transparent image, not a scan of a whole page. */
const MAX_BYTES = 512 * 1024;

export interface SignatureView {
  id: string;
  version: number;
  status: string;
  fileId: string;
  createdAt: string;
  retiredAt: string | null;
}

function toView(row: UserSignature): SignatureView {
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    fileId: row.fileId,
    createdAt: row.createdAt.toISOString(),
    retiredAt: row.retiredAt ? row.retiredAt.toISOString() : null,
  };
}

/** The signature that will sign the next document, or `null` when this person has none. */
export async function getActiveSignature(
  tenantId: string,
  userId: string,
): Promise<UserSignature | null> {
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(userSignatures)
      .where(
        and(
          eq(userSignatures.tenantId, tenantId),
          eq(userSignatures.userId, userId),
          eq(userSignatures.status, 'active'),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  });
}

/** Every version this person has ever had, newest first — their own history, and only theirs. */
export async function listMySignatures(tenantId: string, userId: string): Promise<SignatureView[]> {
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(userSignatures)
      .where(and(eq(userSignatures.tenantId, tenantId), eq(userSignatures.userId, userId)))
      .orderBy(desc(userSignatures.version));
    return rows.map(toView);
  });
}

/**
 * Store a new signature image and make it the active one.
 *
 * The previous version is **retired, not replaced** — its row and its file both stay, because
 * documents signed with it still have to render it.
 */
export async function uploadSignature(
  tenantId: string,
  userId: string,
  input: { filename: string; contentType: string; size: number; buffer: Buffer },
): Promise<SignatureView> {
  if (!ALLOWED_TYPES.includes(input.contentType)) {
    throw Errors.validation(
      { contentType: input.contentType },
      'A signature must be a PNG, JPEG or WebP image',
    );
  }
  if (input.size > MAX_BYTES) {
    throw Errors.validation({ size: input.size }, 'A signature image must be 512 KB or smaller');
  }

  // Stored like any other upload (ADR-007). Its own category, so ops can apply a lifecycle rule
  // to signatures without touching clinical documents.
  const file = await uploadFile({
    tenantId,
    uploadedBy: userId,
    filename: input.filename,
    contentType: input.contentType,
    size: input.size,
    buffer: input.buffer,
    category: 'signatures',
  } satisfies UploadInput);

  const created = await runWithTenant(tenantId, async (tx) => {
    const previous = (
      await tx
        .select()
        .from(userSignatures)
        .where(and(eq(userSignatures.tenantId, tenantId), eq(userSignatures.userId, userId)))
        .orderBy(desc(userSignatures.version))
        .limit(1)
    )[0];

    // Retire first, then insert: the partial unique index allows only one `active` row per user,
    // so doing it the other way round would collide with itself.
    if (previous && previous.status === 'active') {
      await tx
        .update(userSignatures)
        .set({ status: 'superseded', retiredAt: new Date() })
        .where(eq(userSignatures.id, previous.id));
    }

    const rows = await tx
      .insert(userSignatures)
      .values({
        tenantId,
        userId,
        fileId: file.id,
        version: (previous?.version ?? 0) + 1,
        status: 'active',
      })
      .returning();
    return rows[0]!;
  });

  await writeAudit({
    tenantId,
    actorUserId: userId,
    action: 'signature.upload',
    resourceType: 'user_signature',
    resourceId: created.id,
    metadata: { version: created.version, fileId: file.id },
  });
  return toView(created);
}

/**
 * Withdraw the active signature from **future** documents.
 *
 * The row is marked `removed`, not deleted, and its file is not touched — a prescription signed
 * last month still resolves and still renders. "Remove" here means "stop signing with this",
 * which is the only meaning that can be honoured without rewriting history (invariant #6).
 */
export async function removeMySignature(tenantId: string, userId: string): Promise<void> {
  const removed = await runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .update(userSignatures)
      .set({ status: 'removed', retiredAt: new Date() })
      .where(
        and(
          eq(userSignatures.tenantId, tenantId),
          eq(userSignatures.userId, userId),
          eq(userSignatures.status, 'active'),
        ),
      )
      .returning({ id: userSignatures.id, version: userSignatures.version });
    return rows[0] ?? null;
  });
  if (!removed) throw Errors.notFound('You have no signature to remove');

  await writeAudit({
    tenantId,
    actorUserId: userId,
    action: 'signature.remove',
    resourceType: 'user_signature',
    resourceId: removed.id,
    metadata: { version: removed.version },
  });
}

/**
 * What a document needs to render a signature it has already pinned.
 *
 * Resolved **by signature id**, never by "whose document is this, what is their signature now" —
 * that second question is what ADR-137 exists to stop being asked. A missing or unreadable id
 * yields `null` and the document prints a blank signature line, which is what it did before this
 * feature existed and is always a safe answer.
 */
export interface RenderedSignature {
  signatureId: string;
  version: number;
  signedByName: string | null;
  /** Short-lived signed URL for the image. */
  imageUrl: string;
}

export async function resolveSignaturesForDocument(
  tenantId: string,
  signatureIds: readonly (string | null | undefined)[],
): Promise<Map<string, RenderedSignature>> {
  const ids = [...new Set(signatureIds.filter((x): x is string => Boolean(x)))];
  const out = new Map<string, RenderedSignature>();
  if (ids.length === 0) return out;

  const rows = await runWithTenant(tenantId, async (tx) =>
    tx
      .select({ sig: userSignatures, signerName: users.fullName })
      .from(userSignatures)
      .leftJoin(users, eq(users.id, userSignatures.userId))
      .where(and(eq(userSignatures.tenantId, tenantId), inArray(userSignatures.id, ids))),
  );

  for (const row of rows) {
    // A retired or removed version still renders here. That is the point: the document is asking
    // for the signature that signed it, not for one that is current.
    const link = await getDownloadUrl(tenantId, row.sig.fileId, { disposition: 'inline' });
    if (!link) continue;
    out.set(row.sig.id, {
      signatureId: row.sig.id,
      version: row.sig.version,
      signedByName: row.signerName ?? null,
      imageUrl: link.url,
    });
  }
  return out;
}
