import { logger } from '../../config/logger';
import { eventBus } from '../../events/eventBus';
import { isModuleEntitled } from '../entitlement/entitlement.service';
import { recordCareContextForVisit } from './careContext.service';

/**
 * Care contexts, created from the clinical events that already fire (ADR-087).
 *
 * ABDM's rule is "link the care context as soon as the health record is ready to be shared". Our
 * domain events already say exactly that — `encounter.signed`, `lab.result_verified`,
 * `invoice.created` — so this subscribes to them rather than threading ABDM calls through the
 * clinical services. Three consequences, all of them the point:
 *
 * - **The clinical path does not know ABDM exists.** Signing a consultation stays a clinical act;
 *   no ABDM failure can make it fail.
 * - **Ready means ready.** We deliberately use `lab.result_verified`, not `lab.result_ready`: an
 *   unverified result is not something to publish to a national network.
 * - **Every reaction is best-effort.** A care context that fails to record is logged and retried
 *   later by the linking sweep; it never rolls back the record that caused it.
 *
 * Nothing here calls ABDM. It only records, locally, that a shareable record now exists — the
 * linking call is a separate, resumable step, which is what makes the whole thing safe to run
 * behind an event.
 */

/** Records a care context, swallowing failure — a clinical action must never fail because of ABDM. */
async function safely(tenantId: string, visitId: string, hiType: Parameters<typeof recordCareContextForVisit>[2]) {
  try {
    // Hospitals that never bought ABDM should not accumulate care contexts they cannot use.
    if (!(await isModuleEntitled(tenantId, 'abdm'))) return;
    await recordCareContextForVisit(tenantId, visitId, hiType);
  } catch (err) {
    logger.error({ err, tenantId, visitId, hiType }, 'Could not record an ABDM care context');
  }
}

export function registerAbdmSubscribers(): void {
  // A signed consultation is the OP Consultation record, and carries its prescription with it.
  eventBus.subscribe('encounter.signed', async (e) => {
    await safely(e.tenantId, e.visitId, 'OPConsultation');
  });

  // Verified, not merely resulted — see the file header.
  eventBus.subscribe('lab.result_verified', async (e) => {
    const visitId = await visitForLabOrder(e.tenantId, e.labOrderId);
    if (visitId) await safely(e.tenantId, visitId, 'DiagnosticReport');
  });

  eventBus.subscribe('invoice.created', async (e) => {
    const visitId = await visitForInvoice(e.tenantId, e.invoiceId);
    if (visitId) await safely(e.tenantId, visitId, 'Invoice');
  });
}

/** The events carry ids, not visits; the care context is keyed on the visit, so resolve it. */
async function visitForLabOrder(tenantId: string, labOrderId: string): Promise<string | null> {
  const { runWithTenant } = await import('../../db/tenantContext');
  const { labOrders } = await import('../../db/schema');
  const { and, eq } = await import('drizzle-orm');
  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .select({ visitId: labOrders.visitId })
      .from(labOrders)
      .where(and(eq(labOrders.tenantId, tenantId), eq(labOrders.id, labOrderId)))
      .limit(1),
  );
  return rows[0]?.visitId ?? null;
}

async function visitForInvoice(tenantId: string, invoiceId: string): Promise<string | null> {
  const { runWithTenant } = await import('../../db/tenantContext');
  const { invoices } = await import('../../db/schema');
  const { and, eq } = await import('drizzle-orm');
  const rows = await runWithTenant(tenantId, (tx) =>
    tx
      .select({ visitId: invoices.visitId })
      .from(invoices)
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, invoiceId)))
      .limit(1),
  );
  return rows[0]?.visitId ?? null;
}
