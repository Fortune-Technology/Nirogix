import type { Request, Response } from 'express';
import { Errors } from '../../http/error';
import { uploadFile } from '../file/file.service';
import * as svc from './organization.service';

export async function getProfile(req: Request, res: Response): Promise<void> {
  res.json(await svc.getOrganizationProfile(req.auth!.tenantId));
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  res.json(await svc.updateOrganizationProfile(req.auth!.tenantId, req.body, req.auth!.userId));
}

// The letterhead image goes through the same FileStorageService as every other upload
// (ADR-065). MIME is re-checked here, after multer's own filter — the handler never trusts
// the client, only the bytes it received.
export async function uploadLetterheadImage(req: Request, res: Response): Promise<void> {
  const file = req.file;
  if (!file) throw Errors.validation(undefined, 'No file provided (multipart field "file")');
  if (!file.mimetype.startsWith('image/')) throw Errors.validation(undefined, 'The letterhead must be an image');
  const meta = await uploadFile({
    tenantId: req.auth!.tenantId,
    uploadedBy: req.auth!.userId,
    filename: file.originalname,
    contentType: file.mimetype,
    size: file.size,
    buffer: file.buffer,
  });
  res.status(201).json(await svc.setLetterheadImage(req.auth!.tenantId, meta.id, req.auth!.userId));
}

export async function removeLetterheadImage(req: Request, res: Response): Promise<void> {
  res.json(await svc.clearLetterheadImage(req.auth!.tenantId, req.auth!.userId));
}
