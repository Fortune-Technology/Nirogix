import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { requireAuth } from '../../http/requireAuth';
import { requireModule } from '../../http/requireModule';
import { requirePermission } from '../../http/requirePermission';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import {
  OpenEncounterBody,
  SaveEncounterBody,
  AiDraftBody,
  AmendEncounterBody,
} from './emr.schema';
import * as c from './emr.controller';

// Clinical Workflow / EMR — gated by the `emr` module entitlement; the doctor holds EMR_VIEW/WRITE.
export const emrRouter = Router();
const mod = requireModule('emr');

emrRouter.get(
  '/icd10',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.EMR_VIEW),
  asyncHandler(c.searchIcd10),
);
// Read-only chart access: view one encounter / a patient's signed-encounter history.
emrRouter.get(
  '/encounters/:id',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.EMR_VIEW),
  asyncHandler(c.getEncounter),
);
emrRouter.get(
  '/visits/:id/encounter',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.EMR_VIEW),
  asyncHandler(c.getVisitEncounter),
);
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
emrRouter.post(
  '/encounters/:id/sign',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.EMR_WRITE),
  asyncHandler(c.signEncounter),
);
// Correcting a signed consultation (ADR-134). A separate key from EMR_WRITE on purpose: writing
// a note and reopening a closed one are different acts, and a hospital grants them separately.
// Re-signing the correction goes back through /sign, which is why that stays on EMR_WRITE.
emrRouter.post(
  '/encounters/:id/amend',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.EMR_AMEND),
  validate({ body: AmendEncounterBody }),
  asyncHandler(c.amendEncounter),
);
emrRouter.post(
  '/encounters/:id/amend/cancel',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.EMR_AMEND),
  asyncHandler(c.cancelAmendment),
);
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
