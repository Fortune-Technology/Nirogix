import { Router } from 'express';
import { PERMISSIONS } from '@hms/permissions';
import { requireAuth } from '../../http/requireAuth';
import { requireModule } from '../../http/requireModule';
import { requirePermission } from '../../http/requirePermission';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { CreateInvoiceBody, RecordPaymentBody } from './billing.schema';
import * as c from './billing.controller';

// Financial Transaction Infrastructure routes — gated by the `billing` module entitlement,
// then per-action billing permissions (cashier holds all three; admins get view-only).
export const billingRouter = Router();
const mod = requireModule('billing');

billingRouter.get('/invoices', requireAuth, mod, requirePermission(PERMISSIONS.BILLING_VIEW), asyncHandler(c.listInvoices));
billingRouter.get('/invoices/:id', requireAuth, mod, requirePermission(PERMISSIONS.BILLING_VIEW), asyncHandler(c.getInvoice));
billingRouter.post(
  '/invoices',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.BILLING_CREATE),
  validate({ body: CreateInvoiceBody }),
  asyncHandler(c.createInvoice),
);
billingRouter.post(
  '/invoices/:id/payments',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.BILLING_PAYMENT),
  validate({ body: RecordPaymentBody }),
  asyncHandler(c.recordPayment),
);
