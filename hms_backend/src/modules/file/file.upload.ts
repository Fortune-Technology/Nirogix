import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env';
import { AppError } from '../../http/error';

// Server-side validation happens HERE (size + MIME) before the handler runs — never trusting the
// client (rules.md → Security Rules). Extend the allow-list as modules need more types.
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

// Wraps multer so its errors (too large, wrong type) become the canonical error shape.
export function uploadSingle(field: string) {
  const mw = upload.single(field);
  return (req: Request, res: Response, next: NextFunction): void => {
    mw(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof AppError) return next(err);
      const e = err as { code?: string; message?: string };
      if (e.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(413, 'FILE_TOO_LARGE', `File exceeds ${env.FILE_MAX_SIZE_MB} MB`));
      }
      next(new AppError(400, 'UPLOAD_ERROR', e.message ?? 'Upload failed'));
    });
  };
}
