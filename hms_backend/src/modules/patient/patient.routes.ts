import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requireModule } from '../../http/requireModule';
import { requirePermission } from '../../http/requirePermission';
import { CreatePatientBody, UpdatePatientBody } from './patient.schema';
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
