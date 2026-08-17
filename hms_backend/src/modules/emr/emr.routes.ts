import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { requireAuth } from '../../http/requireAuth';
import { requireModule } from '../../http/requireModule';
import { requirePermission } from '../../http/requirePermission';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { OpenEncounterBody, SaveEncounterBody, AiDraftBody } from './emr.schema';
import * as c from './emr.controller';

// Clinical Workflow / EMR — gated by the `emr` module entitlement; the doctor holds EMR_VIEW/WRITE.
export const emrRouter = Router();
const mod = requireModule('emr');

emrRouter.get('/icd10', requireAuth, mod, requirePermission(PERMISSIONS.EMR_VIEW), asyncHandler(c.searchIcd10));
// Read-only chart access: view one encounter / a patient's signed-encounter history.
emrRouter.get('/encounters/:id', requireAuth, mod, requirePermission(PERMISSIONS.EMR_VIEW), asyncHandler(c.getEncounter));
emrRouter.get('/visits/:id/encounter', requireAuth, mod, requirePermission(PERMISSIONS.EMR_VIEW), asyncHandler(c.getVisitEncounter));
emrRouter.get(
  '/patients/:id/encounters',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.EMR_VIEW),
  asyncHandler(c.listPatientEncounters),
);
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
// AI drafting (ADR-070): capability flag is cheap and unauthorized-safe; the draft itself
// is a clinical write-adjacent action — doctor's own permission, emr module gate.
emrRouter.get('/ai/capabilities', requireAuth, asyncHandler(c.aiCapabilities));
emrRouter.post(
  '/ai/prescription-draft',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.EMR_WRITE),
  validate({ body: AiDraftBody }),
  asyncHandler(c.aiPrescriptionDraft),
);
