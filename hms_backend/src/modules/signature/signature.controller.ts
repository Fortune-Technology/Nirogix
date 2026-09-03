import type { Request, Response } from 'express';
import { Errors } from '../../http/error';
import * as svc from './signature.service';
import { getDownloadUrl } from '../file/file.service';

/**
 * Every handler here acts on `req.auth.userId` and takes **no** user id from the client
 * (ADR-137). That is what makes "you can only manage your own" a property of the API surface
 * rather than a check somebody could forget to write.
 */

export async function listMine(req: Request, res: Response): Promise<void> {
  const versions = await svc.listMySignatures(req.auth!.tenantId, req.auth!.userId);
  const active = versions.find((v) => v.status === 'active') ?? null;
  const link = active
    ? await getDownloadUrl(req.auth!.tenantId, active.fileId, { disposition: 'inline' })
    : null;
  res.json({
    active: active ? { ...active, imageUrl: link?.url ?? null } : null,
    versions,
    // Said by the API, not only by the screen: a caller integrating with this must not describe
    // what it returns as a certified digital signature (ADR-137).
    kind: 'electronic_image',
  });
}

export async function upload(req: Request, res: Response): Promise<void> {
  const file = req.file;
  if (!file) throw Errors.validation(undefined, 'No signature image was uploaded');
  const created = await svc.uploadSignature(req.auth!.tenantId, req.auth!.userId, {
    filename: file.originalname,
    contentType: file.mimetype,
    size: file.size,
    buffer: file.buffer,
  });
  const link = await getDownloadUrl(req.auth!.tenantId, created.fileId, { disposition: 'inline' });
  res.status(201).json({ ...created, imageUrl: link?.url ?? null });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await svc.removeMySignature(req.auth!.tenantId, req.auth!.userId);
  res.status(204).end();
}
