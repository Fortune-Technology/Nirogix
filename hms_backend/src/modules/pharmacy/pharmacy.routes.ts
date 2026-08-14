import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { requireAuth } from '../../http/requireAuth';
import { requireModule } from '../../http/requireModule';
import { requirePermission } from '../../http/requirePermission';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { CreateDrugBody, ReceiveStockBody, DispenseBody } from './pharmacy.schema';
import * as c from './pharmacy.controller';

// Pharmacy — gated by the `pharmacy` module entitlement. View/dispense = pharmacist;
// drug master + stock receive = PHARMACY_MANAGE.
export const pharmacyRouter = Router();
const mod = requireModule('pharmacy');

pharmacyRouter.get('/drugs', requireAuth, mod, requirePermission(PERMISSIONS.PHARMACY_STOCK_VIEW), asyncHandler(c.listDrugs));
pharmacyRouter.post(
  '/drugs',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.PHARMACY_MANAGE),
  validate({ body: CreateDrugBody }),
  asyncHandler(c.createDrug),
);
pharmacyRouter.post(
  '/drugs/:id/stock',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.PHARMACY_MANAGE),
  validate({ body: ReceiveStockBody }),
  asyncHandler(c.receiveStock),
);
pharmacyRouter.get('/prescriptions/pending', requireAuth, mod, requirePermission(PERMISSIONS.PHARMACY_DISPENSE), asyncHandler(c.pendingPrescriptions));
pharmacyRouter.post(
  '/dispense',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.PHARMACY_DISPENSE),
  validate({ body: DispenseBody }),
  asyncHandler(c.dispense),
);
