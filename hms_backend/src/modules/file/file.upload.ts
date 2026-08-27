import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env';
import { AppError } from '../../http/error';
import { contentMatchesDeclared, sniffMimeType } from './fileSniff';

// Server-side validation happens HERE (size + declared MIME + CONTENT) before the handler runs —
// never trusting the client (rules.md → Security Rules). Extend the allow-list as modules need
// more types, and give the new type a signature in fileSniff.ts at the same time.
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/tiff',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.FILE_MAX_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new AppError(422, 'UNSUPPORTED_FILE_TYPE', `File type not allowed: ${file.mimetype}`));
  },
});

/**
 * The declared type is a claim; this is the check (SECURITY-AUDIT.md M-4). multer's
 * `fileFilter` only ever sees headers, so content validation happens once the part is
 * buffered — memory storage, so the bytes are already in hand and nothing has been written
 * to disk or object storage yet.
 */
function assertContentMatchesType(file: Express.Multer.File): void {
  const sniffed = sniffMimeType(file.buffer);
  if (!contentMatchesDeclared(file.mimetype, sniffed)) {
    throw new AppError(
      422,
      'FILE_CONTENT_MISMATCH',
      // Says what was wrong without echoing the file's contents or its name back.
      `This file's contents do not match its declared type (${file.mimetype}).`,
    );
  }
}

// Wraps multer so its errors (too large, wrong type, mismatched content) become the canonical
// error shape.
export function uploadSingle(field: string) {
  const mw = upload.single(field);
  return (req: Request, res: Response, next: NextFunction): void => {
    mw(req, res, (err: unknown) => {
      if (!err) {
        if (!req.file) return next();
        try {
          assertContentMatchesType(req.file);
        } catch (contentErr) {
          return next(contentErr);
        }
        return next();
      }
      if (err instanceof AppError) return next(err);
      const e = err as { code?: string; message?: string };
      if (e.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(413, 'FILE_TOO_LARGE', `File exceeds ${env.FILE_MAX_SIZE_MB} MB`));
      }
      next(new AppError(400, 'UPLOAD_ERROR', e.message ?? 'Upload failed'));
    });
  };
}
