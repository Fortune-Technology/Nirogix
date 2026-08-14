import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { requireAuth } from '../../http/requireAuth';
import { requireModule } from '../../http/requireModule';
import { requirePermission } from '../../http/requirePermission';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { OpenEncounterBody, SaveEncounterBody } from './emr.schema';
import * as c from './emr.controller';

// Clinical Workflow / EMR — gated by the `emr` module entitlement; the doctor holds EMR_VIEW/WRITE.
export const emrRouter = Router();
const mod = requireModule('emr');

emrRouter.get('/icd10', requireAuth, mod, requirePermission(PERMISSIONS.EMR_VIEW), asyncHandler(c.searchIcd10));
emrRouter.post(
  '/encounters/open',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.EMR_WRITE),
  validate({ body: OpenEncounterBody }),
  asyncHandler(c.openEncounter),
);
emrRouter.put(
  '/encounters/:id',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.EMR_WRITE),
  validate({ body: SaveEncounterBody }),
  asyncHandler(c.saveEncounter),
);
emrRouter.post('/encounters/:id/sign', requireAuth, mod, requirePermission(PERMISSIONS.EMR_WRITE), asyncHandler(c.signEncounter));
