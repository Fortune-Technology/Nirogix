import { Router } from 'express';
import { PERMISSIONS, CAPABILITIES } from '@hms/permissions';
import { requireAuth } from '../../http/requireAuth';
import { requireModule } from '../../http/requireModule';
import { requireCapability } from '../../http/requireCapability';
import { requirePermission } from '../../http/requirePermission';
import { validate } from '../../http/validate';
import { asyncHandler } from '../../http/asyncHandler';
import { CreateInvoiceBody, RecordPaymentBody, AddInvoiceLineBody, CreateServiceBody, UpdateServiceBody } from './billing.schema';
import { CreateFeeRuleBody, UpdateFeeRuleBody } from './feeRules.schema';
import * as c from './billing.controller';

// Financial Transaction Infrastructure routes — gated by the `billing` module entitlement,
// then per-action billing permissions (cashier holds all three; admins get view-only).
export const billingRouter = Router();
const mod = requireModule('billing');
// The services & packages catalogue is a capability of Billing (ADR-085) — a hospital may run
// Billing while switching this feature off. Deny-by-exception, so it is on by default.
const servicesCap = requireCapability('billing', CAPABILITIES.BILLING_SERVICES);

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
// Add a line to an open invoice — a catalogue service (server-priced) or a custom one-off.
billingRouter.post(
  '/invoices/:id/lines',
  requireAuth,
  mod,
  requirePermission(PERMISSIONS.BILLING_CREATE),
  validate({ body: AddInvoiceLineBody }),
  asyncHandler(c.addLine),
);

// Services & packages catalogue (ADR-067, E-3) — hospital configuration billing consumes.
// Gated by the `billing.services` capability (ADR-085) after the module gate, before permissions.
billingRouter.get('/services', requireAuth, mod, servicesCap, requirePermission(PERMISSIONS.BILLING_SERVICES_VIEW), asyncHandler(c.listServices));
billingRouter.post(
  '/services',
  requireAuth,
  mod,
  servicesCap,
  requirePermission(PERMISSIONS.BILLING_SERVICES_MANAGE),
  validate({ body: CreateServiceBody }),
  asyncHandler(c.createService),
);
billingRouter.patch(
  '/services/:id',
  requireAuth,
  mod,
  servicesCap,
  requirePermission(PERMISSIONS.BILLING_SERVICES_MANAGE),
  validate({ body: UpdateServiceBody }),
  asyncHandler(c.updateService),
);

// Consultation fee schedule (ADR-117). Gated by the `billing` module, then the
// `billing.fee_schedule` capability, then permission — a hospital can switch the schedule off and
// fall back to the doctor's own fee without losing billing.
const feeCap = requireCapability('billing', 'billing.fee_schedule');

billingRouter.get(
  '/fee-rules',
  requireAuth,
  mod,
  feeCap,
  requirePermission(PERMISSIONS.BILLING_FEE_RULES_VIEW),
  asyncHandler(c.listFeeRules),
);
billingRouter.get(
  '/fee-rules/preview',
  requireAuth,
  mod,
  feeCap,
  requirePermission(PERMISSIONS.BILLING_FEE_RULES_VIEW),
  asyncHandler(c.previewFee),
);
billingRouter.post(
  '/fee-rules',
  requireAuth,
  mod,
  feeCap,
  requirePermission(PERMISSIONS.BILLING_FEE_RULES_MANAGE),
  validate({ body: CreateFeeRuleBody }),
  asyncHandler(c.createFeeRule),
);
billingRouter.patch(
  '/fee-rules/:id',
  requireAuth,
  mod,
  feeCap,
  requirePermission(PERMISSIONS.BILLING_FEE_RULES_MANAGE),
  validate({ body: UpdateFeeRuleBody }),
  asyncHandler(c.updateFeeRule),
);
