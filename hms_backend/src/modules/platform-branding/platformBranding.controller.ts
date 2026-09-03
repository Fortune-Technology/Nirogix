import type { Request, Response } from 'express';
import { Errors } from '../../http/error';
import { uploadFile } from '../file/file.service';
import * as svc from './platformBranding.service';
import type { PlatformBrandingScope } from './platformBranding.service';

function parseScope(req: Request): PlatformBrandingScope {
  const s = req.params.scope;
  if (s !== 'marketing' && s !== 'hms') {
    throw Errors.validation(undefined, "scope must be 'marketing' or 'hms'");
  }
  return s;
}

// Public: the marketing site (and the Portal's default read) fetch their scope unauthenticated.
export async function getPublic(req: Request, res: Response): Promise<void> {
  res.json(await svc.getPlatformBranding(parseScope(req)));
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json(await svc.updatePlatformBranding(parseScope(req), req.body.tokens, req.auth!.userId));
}

export async function reset(req: Request, res: Response): Promise<void> {
  res.json(await svc.resetPlatformBranding(parseScope(req), req.auth!.userId));
}

async function storeAsset(req: Request): Promise<string> {
  const file = req.file;
  if (!file) throw Errors.validation(undefined, 'No file provided (multipart field "file")');
  if (!file.mimetype.startsWith('image/'))
    throw Errors.validation(undefined, 'Branding assets must be an image');
  // Platform assets live under the PLATFORM tenant so the tenant-scoped storage works unchanged.
  const tenantId = await svc.platformTenantId();
  const meta = await uploadFile({
    tenantId,
    uploadedBy: req.auth!.userId,
    filename: file.originalname,
    contentType: file.mimetype,
    size: file.size,
    buffer: file.buffer,
    category: 'platform-branding',
  });
  return meta.id;
}

export async function uploadLogo(req: Request, res: Response): Promise<void> {
  const scope = parseScope(req);
  const fileId = await storeAsset(req);
  await svc.setPlatformLogo(scope, fileId, req.auth!.userId);
  res.status(201).json(await svc.getPlatformBranding(scope));
}

export async function uploadFavicon(req: Request, res: Response): Promise<void> {
  const scope = parseScope(req);
  const fileId = await storeAsset(req);
  await svc.setPlatformFavicon(scope, fileId, req.auth!.userId);
  res.status(201).json(await svc.getPlatformBranding(scope));
}
