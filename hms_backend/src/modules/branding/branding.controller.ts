import type { Request, Response } from 'express';
import { Errors } from '../../http/error';
import { uploadFile } from '../file/file.service';
import * as svc from './branding.service';

export async function getCurrent(req: Request, res: Response): Promise<void> {
  res.json(await svc.getCurrentBranding(req.auth!.tenantId));
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json(await svc.updateBranding(req.auth!.tenantId, req.body, req.auth!.userId));
}

export async function reset(req: Request, res: Response): Promise<void> {
  await svc.resetBranding(req.auth!.tenantId, req.auth!.userId);
  res.json(await svc.getCurrentBranding(req.auth!.tenantId));
}

async function storeAsset(req: Request): Promise<string> {
  const file = req.file;
  if (!file) throw Errors.validation(undefined, 'No file provided (multipart field "file")');
  if (!file.mimetype.startsWith('image/'))
    throw Errors.validation(undefined, 'Branding assets must be an image');
  const meta = await uploadFile({
    tenantId: req.auth!.tenantId,
    uploadedBy: req.auth!.userId,
    filename: file.originalname,
    contentType: file.mimetype,
    size: file.size,
    buffer: file.buffer,
    category: 'branding',
  });
  return meta.id;
}

export async function uploadLogo(req: Request, res: Response): Promise<void> {
  const fileId = await storeAsset(req);
  await svc.setLogo(req.auth!.tenantId, fileId, req.auth!.userId);
  res.status(201).json(await svc.getCurrentBranding(req.auth!.tenantId));
}

export async function uploadFavicon(req: Request, res: Response): Promise<void> {
  const fileId = await storeAsset(req);
  await svc.setFavicon(req.auth!.tenantId, fileId, req.auth!.userId);
  res.status(201).json(await svc.getCurrentBranding(req.auth!.tenantId));
}
