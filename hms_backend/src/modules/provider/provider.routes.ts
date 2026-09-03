import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { requireAuth } from '../../http/requireAuth';
import { requirePermission } from '../../http/requirePermission';
import {
  CreateProviderBody,
  UpdateProviderBody,
  AssignSpecialtyBody,
  CreateFormTemplateBody,
  SetSchedulesBody,
} from './provider.schema';
import * as c from './provider.controller';

export const providerRouter = Router();

// Specialty catalog — reference data any authenticated user can read.
providerRouter.get('/specialties', requireAuth, asyncHandler(c.listSpecialties));

providerRouter.get(
  '/providers',
  requireAuth,
  requirePermission(PERMISSIONS.PROVIDER_VIEW),
  asyncHandler(c.listProviders),
);
providerRouter.post(
  '/providers',
  requireAuth,
  requirePermission(PERMISSIONS.PROVIDER_MANAGE),
  validate({ body: CreateProviderBody }),
  asyncHandler(c.createProvider),
);
providerRouter.get(
  '/providers/:id',
  requireAuth,
  requirePermission(PERMISSIONS.PROVIDER_VIEW),
  asyncHandler(c.getProvider),
);
providerRouter.patch(
  '/providers/:id',
  requireAuth,
  requirePermission(PERMISSIONS.PROVIDER_MANAGE),
  validate({ body: UpdateProviderBody }),
  asyncHandler(c.updateProvider),
);
providerRouter.post(
  '/providers/:id/specialties',
  requireAuth,
  requirePermission(PERMISSIONS.PROVIDER_MANAGE),
  validate({ body: AssignSpecialtyBody }),
  asyncHandler(c.assignSpecialty),
);
// Weekly roster (ADR-069): read wide, write with provider management.
providerRouter.get(
  '/providers/:id/schedules',
  requireAuth,
  requirePermission(PERMISSIONS.PROVIDER_VIEW),
  asyncHandler(c.listSchedules),
);
providerRouter.put(
  '/providers/:id/schedules',
  requireAuth,
  requirePermission(PERMISSIONS.PROVIDER_MANAGE),
  validate({ body: SetSchedulesBody }),
  asyncHandler(c.setSchedules),
);
providerRouter.get(
  '/providers/:id/slots',
  requireAuth,
  requirePermission(PERMISSIONS.PROVIDER_VIEW),
  asyncHandler(c.listFreeSlots),
);

providerRouter.get(
  '/specialty-templates',
  requireAuth,
  requirePermission(PERMISSIONS.PROVIDER_VIEW),
  asyncHandler(c.listTemplates),
);
providerRouter.post(
  '/specialty-templates',
  requireAuth,
  requirePermission(PERMISSIONS.PROVIDER_MANAGE),
  validate({ body: CreateFormTemplateBody }),
  asyncHandler(c.createTemplate),
);
