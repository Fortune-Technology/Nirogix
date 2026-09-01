import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requireModule } from '../../http/requireModule';
import { requirePermission } from '../../http/requirePermission';
import { CreatePatientBody, UpdatePatientBody } from './patient.schema';
import { ArchiveDocumentBody, AttachDocumentBody } from './document.schema';
import * as c from './patient.controller';

// Patient Management (MVP 0). The first real business module through the full authz chain:
// requireAuth → requireModule('patient') → requirePermission → logic. A tenant not entitled to
// the `patient` module gets 403 MODULE_NOT_ENTITLED before any permission check.
export const patientRouter = Router();

const mod = requireModule('patient');

patientRouter.get(
  '/patients',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.PATIENT_VIEW),
  asyncHandler(c.listPatients),
);
patientRouter.post(
  '/patients',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.PATIENT_CREATE),
  validate({ body: CreatePatientBody }),
  asyncHandler(c.createPatient),
);
patientRouter.get(
  '/patients/:id',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.PATIENT_VIEW),
  asyncHandler(c.getPatient),
);
patientRouter.patch(
  '/patients/:id',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.PATIENT_UPDATE),
  validate({ body: UpdatePatientBody }),
  asyncHandler(c.updatePatient),
);

/**
 * Documents attached to a patient (ADR-119). Gated on the FILE permissions rather than a new pair:
 * the question "may this person see and add documents?" is the one `file.document.view` and
 * `file.document.upload` already answer, and the front desk holds both because handing over a
 * referral letter at the counter is front-desk work.
 *
 * The upload itself is still `POST /files` — this records what the file is about.
 */
patientRouter.get(
  '/patients/:id/documents',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.FILE_VIEW),
  asyncHandler(c.listDocuments),
);
patientRouter.post(
  '/patients/:id/documents',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.FILE_UPLOAD),
  validate({ body: AttachDocumentBody }),
  asyncHandler(c.attachDocument),
);
// Archiving an attachment is a correction, not a deletion — the file itself is untouched, which
// is why this is not gated on FILE_DELETE.
patientRouter.post(
  '/patients/:id/documents/:docId/archive',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.FILE_UPLOAD),
  validate({ body: ArchiveDocumentBody }),
  asyncHandler(c.archiveDocument),
);
