import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@hms/permissions';
import { requireAuth } from '../../http/requireAuth';
import { requireModule } from '../../http/requireModule';
import { requirePermission } from '../../http/requirePermission';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { RecordImmunizationBody } from './immunization.schema';
import * as c from './immunization.controller';

// Patient immunisations (ADR-072 consumer) — gated by the `patient` module. Viewing rides with the
// patient record; recording is the clinical/front-desk permission.
export const immunizationRouter = Router();
const mod = requireModule('patient');
const params = validate({ params: z.object({ patientId: z.string().uuid() }) });

immunizationRouter.get(
  '/patients/:patientId/immunizations',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.IMMUNIZATION_VIEW),
  params,
  asyncHandler(c.list),
);
immunizationRouter.post(
  '/patients/:patientId/immunizations',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.IMMUNIZATION_MANAGE),
  params,
  validate({ body: RecordImmunizationBody }),
  asyncHandler(c.record),
);
