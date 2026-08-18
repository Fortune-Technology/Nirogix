import type { Request, Response } from 'express';
import { Errors } from '../../http/error';
import { verifyFileToken } from './fileToken';
import {
  uploadFile,
  getDownloadUrl,
  getFileContent,
  deleteFile,
  resolveCategory,
} from './file.service';
import type { FileMetadata } from '../../db/schema';

function toMeta(m: FileMetadata) {
  return {
    id: m.id,
    filename: m.filename,
    contentType: m.contentType,
    size: m.size,
    checksum: m.checksum,
    version: m.version,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
  };
}

export async function upload(req: Request, res: Response): Promise<void> {
  const file = req.file;
  if (!file) throw Errors.validation(undefined, 'No file provided (multipart field "file")');
  // Optional `?category=` (e.g. lab-reports) folders the object; unknown values fall back
  // to `documents` inside uploadFile. Never trusted straight into the storage key.
  const category = resolveCategory(typeof req.query.category === 'string' ? req.query.category : undefined);
  const meta = await uploadFile({
    tenantId: req.auth!.tenantId,
    uploadedBy: req.auth!.userId,
    filename: file.originalname,
    contentType: file.mimetype,
    size: file.size,
    buffer: file.buffer,
    category,
  });
  res.status(201).json(toMeta(meta));
}

export async function getUrl(req: Request, res: Response): Promise<void> {
  const result = await getDownloadUrl(req.auth!.tenantId, req.params.id!);
  if (!result) throw Errors.notFound('File not found');
  res.json({ downloadUrl: result.url, expiresInSeconds: result.expiresInSeconds });
}

// Token-authorized (no session): the signed token carries tenant + file id.
export async function content(req: Request, res: Response): Promise<void> {
  const token = String(req.query.token ?? '');
  let claims;
  try {
    claims = verifyFileToken(token);
  } catch {
    throw Errors.unauthorized('Invalid or expired file token');
  }
  if (claims.fid !== req.params.id) throw Errors.unauthorized('Token does not match file');
  const result = await getFileContent(claims.tid, claims.fid);
  if (!result) throw Errors.notFound('File not found');
  res.setHeader('Content-Type', result.meta.contentType);
  res.setHeader('Content-Disposition', `inline; filename="${result.meta.filename}"`);
  // These assets are embedded cross-origin by design — the frontends (portal, patient, admin,
  // and every print document) run on their own origins, while the API serves the file. Helmet's
  // default `Cross-Origin-Resource-Policy: same-origin` would block the <img>, so relax it for
  // this one route. Safe: access is already gated by the signed, short-lived token in the URL.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(result.body);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const ok = await deleteFile(req.auth!.tenantId, req.params.id!, req.auth!.userId);
  if (!ok) throw Errors.notFound('File not found');
  res.status(204).send();
}
