import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@hms/permissions';
import { requireAuth } from '../../http/requireAuth';
import { requirePermission } from '../../http/requirePermission';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import {
  CatalogCategoryEnum,
  CreateCustomItemBody,
  AvailabilityItemTypeEnum,
  SetAvailabilityBody,
} from './catalog.schema';
import * as c from './catalog.controller';

// System master-data catalogue (ADR-072). Reading the catalogue is available to any authenticated
// user — it is non-sensitive reference data (like the specialty catalogue), and a category's
// tenant-specific custom items are RLS-scoped to the caller's hospital inside the service. Writing
// a custom item is gated by the relevant clinical permission.
export const catalogRouter = Router();

catalogRouter.get(
  '/catalog/:category',
  requireAuth,
  validate({ params: z.object({ category: CatalogCategoryEnum }) }),
  asyncHandler(c.list),
);

// Only vaccines accept a hospital-specific custom item today (the priced catalogues add custom
// entries through their own module endpoints, which also carry the price). Gated by the
// immunisation management permission.
catalogRouter.post(
  '/catalog/vaccine/custom',
  requireAuth,
  requirePermission(PERMISSIONS.IMMUNIZATION_MANAGE),
  validate({ body: CreateCustomItemBody }),
  asyncHandler(c.createCustomVaccine),
);

// Per-hospital availability overlay (ADR-073) — the org configures which items each branch offers.
catalogRouter.get(
  '/branch-availability',
  requireAuth,
  requirePermission(PERMISSIONS.CATALOG_AVAILABILITY_MANAGE),
  validate({
    query: z.object({ branchId: z.string().uuid(), itemType: AvailabilityItemTypeEnum.optional() }),
  }),
  asyncHandler(c.listAvailability),
);
// The org's items of a type with their availability at a branch — the config screen's read model.
catalogRouter.get(
  '/branch-availability/items',
  requireAuth,
  requirePermission(PERMISSIONS.CATALOG_AVAILABILITY_MANAGE),
  validate({
    query: z.object({ branchId: z.string().uuid(), itemType: AvailabilityItemTypeEnum }),
  }),
  asyncHandler(c.listAvailabilityItems),
);
catalogRouter.put(
  '/branch-availability',
  requireAuth,
  requirePermission(PERMISSIONS.CATALOG_AVAILABILITY_MANAGE),
  validate({ body: SetAvailabilityBody }),
  asyncHandler(c.setAvailability),
);
