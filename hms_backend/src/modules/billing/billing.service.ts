import { and, count, desc, eq, sql } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import {
  invoices,
  invoiceLineItems,
  payments,
  patients,
  type Invoice as InvoiceRow,
} from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';
import { eventBus } from '../../events/eventBus';

// Financial Transaction Infrastructure (invariant #8). Pure invoice/line-item/payment logic —
// no clinical knowledge. Consumed by OPD, and later Pharmacy/Lab/IPD, each of which adds its own
// line-item type. Money is integer paise throughout.

export interface LineItemInput {
  itemType: string;
  description: string;
  quantity?: number;
  unitPricePaise: number;
  taxRateBps?: number;
  sourceModule?: string | null;
  sourceRef?: string | null;
}

function computeLine(item: LineItemInput): { taxPaise: number; lineTotalPaise: number } {
  const qty = item.quantity ?? 1;
  const base = item.unitPricePaise * qty;
  const taxPaise = Math.round((base * (item.taxRateBps ?? 0)) / 10000);
  return { taxPaise, lineTotalPaise: base + taxPaise };
}

function invoiceStatus(total: number, paid: number, current: string): string {
  if (current === 'void') return 'void';
  if (paid <= 0) return current === 'paid' || current === 'partially_paid' ? 'draft' : current;
  if (paid >= total) return 'paid';
  return 'partially_paid';
}

// Build the API shape for a single invoice (with line items + payments + patient).
export async function getInvoice(tenantId: string, invoiceId: string) {
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        inv: invoices,
        patientName: sql<string>`${patients.firstName} || ' ' || coalesce(${patients.lastName}, '')`,
        patientUhid: patients.uhid,
      })
      .from(invoices)
      .innerJoin(patients, eq(patients.id, invoices.patientId))
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, invoiceId)))
      .limit(1);
    const row = rows[0];
    if (!row) throw Errors.notFound('Invoice not found');

    const [lines, pays] = await Promise.all([
      tx.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoiceId)).orderBy(invoiceLineItems.createdAt),
      tx.select().from(payments).where(eq(payments.invoiceId, invoiceId)).orderBy(payments.collectedAt),
    ]);

    const inv = row.inv;
    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      currency: inv.currency,
      subtotalPaise: inv.subtotalPaise,
      taxPaise: inv.taxPaise,
      totalPaise: inv.totalPaise,
      amountPaidPaise: inv.amountPaidPaise,
      balancePaise: inv.totalPaise - inv.amountPaidPaise,
      notes: inv.notes,
      visitId: inv.visitId,
      patientId: inv.patientId,
      patientName: row.patientName,
      patientUhid: row.patientUhid,
      createdAt: inv.createdAt.toISOString(),
      lineItems: lines.map((l) => ({
        id: l.id,
        itemType: l.itemType,
        description: l.description,
        quantity: l.quantity,
        unitPricePaise: l.unitPricePaise,
        taxRateBps: l.taxRateBps,
        taxPaise: l.taxPaise,
        lineTotalPaise: l.lineTotalPaise,
      })),
      payments: pays.map((p) => ({
        id: p.id,
        amountPaise: p.amountPaise,
        method: p.method,
        reference: p.reference,
        status: p.status,
        collectedAt: p.collectedAt.toISOString(),
      })),
    };
  });
}

export interface CreateInvoiceInput {
  patientId: string;
  branchId?: string | null;
  visitId?: string | null;
  notes?: string | null;
  lineItems: LineItemInput[];
}

export async function createInvoice(tenantId: string, input: CreateInvoiceInput, actorUserId?: string) {
  if (input.lineItems.length === 0) throw Errors.validation(undefined, 'An invoice needs at least one line item');

  const computed = input.lineItems.map((li) => ({ li, ...computeLine(li) }));
  const subtotalPaise = computed.reduce((s, c) => s + c.li.unitPricePaise * (c.li.quantity ?? 1), 0);
  const taxPaise = computed.reduce((s, c) => s + c.taxPaise, 0);
  const totalPaise = subtotalPaise + taxPaise;

  const invoice = await runWithTenant(tenantId, async (tx) => {
    const patientRows = await tx
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.tenantId, tenantId), eq(patients.id, input.patientId)))
      .limit(1);
    if (!patientRows[0]) throw Errors.notFound('Patient not found');

    // Allocate a tenant-monotonic invoice number, retrying on the unique conflict (race-safe).
    const existing = Number((await tx.select({ c: count() }).from(invoices).where(eq(invoices.tenantId, tenantId)))[0]?.c ?? 0);
    let row: InvoiceRow | undefined;
    for (let i = 1; i <= 8; i++) {
      const invoiceNumber = `INV-${String(existing + i).padStart(6, '0')}`;
      const inserted = await tx
        .insert(invoices)
        .values({
          tenantId,
          branchId: input.branchId ?? null,
          patientId: input.patientId,
          visitId: input.visitId ?? null,
          invoiceNumber,
          status: 'draft',
          subtotalPaise,
          taxPaise,
          totalPaise,
          notes: input.notes ?? null,
          createdBy: actorUserId ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted[0]) {
        row = inserted[0];
        break;
      }
    }
    if (!row) throw Errors.conflict('Could not allocate an invoice number — please retry');

    await tx.insert(invoiceLineItems).values(
      computed.map((c) => ({
        tenantId,
        invoiceId: row!.id,
        itemType: c.li.itemType,
        description: c.li.description,
        quantity: c.li.quantity ?? 1,
        unitPricePaise: c.li.unitPricePaise,
        taxRateBps: c.li.taxRateBps ?? 0,
        taxPaise: c.taxPaise,
        lineTotalPaise: c.lineTotalPaise,
        sourceModule: c.li.sourceModule ?? null,
        sourceRef: c.li.sourceRef ?? null,
      })),
    );
    return row;
  });

  eventBus.publish('invoice.created', { tenantId, invoiceId: invoice.id });
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'invoice.create',
    resourceType: 'invoice',
    resourceId: invoice.id,
    metadata: { invoiceNumber: invoice.invoiceNumber, totalPaise },
  });
  return getInvoice(tenantId, invoice.id);
}

export interface ListInvoicesFilter {
  patientId?: string;
  status?: string;
  page: number;
  pageSize: number;
}

export async function listInvoices(tenantId: string, filter: ListInvoicesFilter) {
  return runWithTenant(tenantId, async (tx) => {
    const conds = [eq(invoices.tenantId, tenantId)];
    if (filter.patientId) conds.push(eq(invoices.patientId, filter.patientId));
    if (filter.status) conds.push(eq(invoices.status, filter.status));
    const where = and(...conds);

    const [rows, totalRows] = await Promise.all([
      tx
        .select({
          inv: invoices,
          patientName: sql<string>`${patients.firstName} || ' ' || coalesce(${patients.lastName}, '')`,
          patientUhid: patients.uhid,
        })
        .from(invoices)
        .innerJoin(patients, eq(patients.id, invoices.patientId))
        .where(where)
        .orderBy(desc(invoices.createdAt))
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      tx.select({ c: count() }).from(invoices).where(where),
    ]);

    return {
      rows: rows.map((r) => ({
        id: r.inv.id,
        invoiceNumber: r.inv.invoiceNumber,
        status: r.inv.status,
        totalPaise: r.inv.totalPaise,
        amountPaidPaise: r.inv.amountPaidPaise,
        balancePaise: r.inv.totalPaise - r.inv.amountPaidPaise,
        currency: r.inv.currency,
        createdAt: r.inv.createdAt.toISOString(),
        patientId: r.inv.patientId,
        patientName: r.patientName,
        patientUhid: r.patientUhid,
      })),
      total: Number(totalRows[0]?.c ?? 0),
    };
  });
}

export interface RecordPaymentInput {
  amountPaise: number;
  method: string;
  reference?: string | null;
  idempotencyKey: string;
}

export async function recordPayment(tenantId: string, invoiceId: string, input: RecordPaymentInput, actorUserId?: string) {
  if (input.amountPaise <= 0) throw Errors.validation(undefined, 'Payment amount must be positive');

  const { paymentId, deduped } = await runWithTenant(tenantId, async (tx) => {
    const inv = (
      await tx.select().from(invoices).where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, invoiceId))).limit(1)
    )[0];
    if (!inv) throw Errors.notFound('Invoice not found');
    if (inv.status === 'void') throw Errors.conflict('Cannot collect against a void invoice');

    // Idempotent insert: a repeated (tenant, idempotency_key) hits the unique constraint and
    // returns no row, so we treat it as a duplicate and skip re-applying it.
    const inserted = await tx
      .insert(payments)
      .values({
        tenantId,
        invoiceId,
        amountPaise: input.amountPaise,
        method: input.method,
        reference: input.reference ?? null,
        status: 'captured',
        idempotencyKey: input.idempotencyKey,
        collectedBy: actorUserId ?? null,
      })
      .onConflictDoNothing()
      .returning();

    if (!inserted[0]) return { paymentId: null as string | null, deduped: true };

    // Recompute paid + status from the ledger (sum of captured payments).
    const paidRow = (
      await tx
        .select({ paid: sql<number>`coalesce(sum(${payments.amountPaise}), 0)` })
        .from(payments)
        .where(and(eq(payments.invoiceId, invoiceId), eq(payments.status, 'captured')))
    )[0];
    const amountPaidPaise = Number(paidRow?.paid ?? 0);
    const status = invoiceStatus(inv.totalPaise, amountPaidPaise, inv.status);

    await tx
      .update(invoices)
      .set({ amountPaidPaise, status, version: sql`${invoices.version} + 1`, updatedAt: new Date() })
      .where(eq(invoices.id, invoiceId));

    return { paymentId: inserted[0].id, deduped: false };
  });

  if (!deduped && paymentId) {
    eventBus.publish('payment.received', { tenantId, paymentId, invoiceId });
    await writeAudit({
      tenantId,
      actorUserId: actorUserId ?? null,
      action: 'payment.collect',
      resourceType: 'payment',
      resourceId: paymentId,
      metadata: { invoiceId, amountPaise: input.amountPaise, method: input.method },
    });
  }

  return getInvoice(tenantId, invoiceId);
}
