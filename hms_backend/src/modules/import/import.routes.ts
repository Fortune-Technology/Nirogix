import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { expensiveLimiter } from '../../http/rateLimit';
import { AppError } from '../../http/error';
import * as c from './import.controller';

/**
 * Bulk import (ADR-138).
 *
 * **No `requirePermission` in this table, deliberately** — and this is the only router in the
 * product that says so. The module is a path parameter, and each importable module carries its
 * own key (medicines need `pharmacy.stock.manage`, patients `patient.record.create`), so a fixed
 * permission here could only ever have named one of six. The handler checks the right one with
 * `checkPermission` before doing anything; `listModules` additionally *filters* to what the
 * caller may actually do, so nobody is offered an import that will refuse them (ADR-126).
 *
 * A separate `multer` from the file module's: this accepts CSV, which that one does not, and
 * widening the file module's allow-list would let a CSV be uploaded as a patient document.
 */
export const importRouter = Router();

const csvUpload = multer({
  storage: multer.memoryStorage(),
  // 5000 rows of master data is comfortably inside this; a bigger file is a different problem.
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    // Browsers and operating systems disagree about what a .csv is called, and Excel's
    // "Save as CSV" produces `application/vnd.ms-excel` on Windows. The extension is the
    // reliable signal; the handler then checks the bytes are actually text.
    const okType = [
      'text/csv',
      'application/csv',
      'text/plain',
      'application/vnd.ms-excel',
      '',
    ].includes(file.mimetype);
    const okName = /\.csv$/i.test(file.originalname);
    if (okType || okName) cb(null, true);
    else cb(new AppError(422, 'UNSUPPORTED_FILE_TYPE', 'Upload a CSV file'));
  },
});

// What this caller can import, and the duplicate strategies on offer.
importRouter.get('/imports', requireAuth, asyncHandler(c.listModules));

// The history (§10.7). Deliberately unfiltered by module permission: it is a record of what was
// done to this hospital's data, and an administrator reviewing it should see all of it.
importRouter.get('/imports/history', requireAuth, asyncHandler(c.history));

importRouter.get('/imports/:module/template', requireAuth, asyncHandler(c.template));

importRouter.post(
  '/imports/:module/preview',
  requireAuth,
  expensiveLimiter,
  csvUpload.single('file'),
  asyncHandler(c.preview),
);

importRouter.post(
  '/imports/:module/commit',
  requireAuth,
  expensiveLimiter,
  csvUpload.single('file'),
  asyncHandler(c.commit),
);
