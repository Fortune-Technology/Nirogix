import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { requireAuth } from '../../http/requireAuth';
import { requireModule } from '../../http/requireModule';
import { requireCapability } from '../../http/requireCapability';
import { requirePermission } from '../../http/requirePermission';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { RecordVitalsBody, UpdateWorkflowConfigBody } from './workflow.schema';
import * as c from './workflow.controller';

export const workflowRouter = Router();

/**
 * Workflow configuration is hospital configuration, not a clinical module: it is how the
 * organization has decided to run, and an administrator reaches it without the `emr` entitlement.
 * The vitals routes below are gated by `emr` and its `emr.vitals` capability, in that order, then
 * by permission — the chain in ADR-085.
 */
workflowRouter.get(
  '/workflow-config',
  requireAuth,
  requirePermission(PERMISSIONS.WORKFLOW_CONFIG_VIEW),
  asyncHandler(c.getWorkflowConfig),
);
workflowRouter.put(
  '/workflow-config',
  requireAuth,
  requirePermission(PERMISSIONS.WORKFLOW_CONFIG_MANAGE),
  validate({ body: UpdateWorkflowConfigBody }),
  asyncHandler(c.updateWorkflowConfig),
);

const emr = requireModule('emr');
const vitalsCap = requireCapability('emr', 'emr.vitals');

workflowRouter.post(
  '/vitals',
  requireAuth,
  emr,
  vitalsCap,
  requirePermission(PERMISSIONS.VITALS_RECORD),
  validate({ body: RecordVitalsBody }),
  asyncHandler(c.recordVitals),
);
workflowRouter.get(
  '/visits/:visitId/vitals',
  requireAuth,
  emr,
  vitalsCap,
  requirePermission(PERMISSIONS.VITALS_VIEW),
  asyncHandler(c.listVisitVitals),
);
// The vitals queue is only meaningful under `vitalsMode: after_checkin`; the service returns an
// empty list otherwise rather than 404-ing, because a hospital switching mode mid-day should see
// the screen empty, not broken.
workflowRouter.get(
  '/vitals/queue',
  requireAuth,
  emr,
  vitalsCap,
  requirePermission(PERMISSIONS.VITALS_VIEW),
  asyncHandler(c.listVitalsQueue),
);
