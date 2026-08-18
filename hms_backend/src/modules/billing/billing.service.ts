import { and, asc, count, desc, eq, gte, ilike, inArray, lte, sql } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import {
  invoices,
  invoiceLineItems,
  payments,
  patients,
  services,
  departments,
  type Invoice as InvoiceRow,
} from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';
import { eventBus } from '../../events/eventBus';
import { resolveOverrides, isRefAvailable, priceFor } from '../catalog/branchAvailability.service';

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

    // Serialize number allocation per tenant (transaction-scoped advisory lock), then allocate a
    // tenant-monotonic invoice number — the unique-conflict retry stays as the belt-and-braces.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${tenantId}:invoice_no`}))`);
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
    if (!row) throw Errors.conflict('Could not allocate an invoice number. Please retry');

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

// Has this clinical record already been billed (on any invoice)? Revenue modules use this to
// keep "bill once" idempotent across their retry paths; the DB unique index is the backstop.
export async function hasSourceLine(tenantId: string, sourceModule: string, sourceRef: string): Promise<boolean> {
  return runWithTenant(tenantId, async (tx) => {
    const row = (
      await tx
        .select({ id: invoiceLineItems.id })
        .from(invoiceLineItems)
        .where(
          and(
            eq(invoiceLineItems.tenantId, tenantId),
            eq(invoiceLineItems.sourceModule, sourceModule),
            eq(invoiceLineItems.sourceRef, sourceRef),
          ),
        )
        .limit(1)
    )[0];
    return Boolean(row);
  });
}

// Billing-Core extension point (invariant #8): a revenue module (Pharmacy, Lab, …) adds a line
// to an existing invoice and totals are recomputed from the ledger. Never reimplemented downstream.
export async function addInvoiceLine(tenantId: string, invoiceId: string, item: LineItemInput, actorUserId?: string) {
  const { taxPaise, lineTotalPaise } = computeLine(item);
  await runWithTenant(tenantId, async (tx) => {
    // Lock the invoice row: concurrent line adds would otherwise race the total recompute.
    const inv = (
      await tx.select().from(invoices).where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, invoiceId))).limit(1).for('update')
    )[0];
    if (!inv) throw Errors.notFound('Invoice not found');
    if (inv.status === 'void') throw Errors.conflict('Cannot add a line to a void invoice');

    // One billed line per originating clinical record (unique index invoice_line_source_unique).
    if (item.sourceModule && item.sourceRef) {
      const dup = (
        await tx
          .select({ id: invoiceLineItems.id })
          .from(invoiceLineItems)
          .where(
            and(
              eq(invoiceLineItems.tenantId, tenantId),
              eq(invoiceLineItems.sourceModule, item.sourceModule),
              eq(invoiceLineItems.sourceRef, item.sourceRef),
            ),
          )
          .limit(1)
      )[0];
      if (dup) throw Errors.conflict('This item has already been billed');
    }

    await tx.insert(invoiceLineItems).values({
      tenantId,
      invoiceId,
      itemType: item.itemType,
      description: item.description,
      quantity: item.quantity ?? 1,
      unitPricePaise: item.unitPricePaise,
      taxRateBps: item.taxRateBps ?? 0,
      taxPaise,
      lineTotalPaise,
      sourceModule: item.sourceModule ?? null,
      sourceRef: item.sourceRef ?? null,
    });

    // Recompute from the ledger: total = Σ line totals, tax = Σ line tax, subtotal = total − tax.
    const agg = (
      await tx
        .select({
          total: sql<number>`coalesce(sum(${invoiceLineItems.lineTotalPaise}), 0)`,
          tax: sql<number>`coalesce(sum(${invoiceLineItems.taxPaise}), 0)`,
        })
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, invoiceId))
    )[0];
    const total = Number(agg?.total ?? 0);
    const tax = Number(agg?.tax ?? 0);
    await tx
      .update(invoices)
      .set({
        subtotalPaise: total - tax,
        taxPaise: tax,
        totalPaise: total,
        status: invoiceStatus(total, inv.amountPaidPaise, inv.status),
        version: sql`${invoices.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));
  });

  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'invoice.line_add',
    resourceType: 'invoice',
    resourceId: invoiceId,
    metadata: { itemType: item.itemType, sourceModule: item.sourceModule ?? null },
  });
  return getInvoice(tenantId, invoiceId);
}

export interface ListInvoicesFilter {
  patientId?: string;
  status?: readonly string[];
  /** Invoice-total range in paise (ADR-063). */
  amountFrom?: number;
  amountTo?: number;
  page: number;
  pageSize: number;
}

export async function listInvoices(tenantId: string, filter: ListInvoicesFilter) {
  return runWithTenant(tenantId, async (tx) => {
    const conds = [eq(invoices.tenantId, tenantId)];
    if (filter.patientId) conds.push(eq(invoices.patientId, filter.patientId));
    if (filter.status?.length) conds.push(inArray(invoices.status, filter.status as string[]));
    if (filter.amountFrom !== undefined) conds.push(gte(invoices.totalPaise, filter.amountFrom));
    if (filter.amountTo !== undefined) conds.push(lte(invoices.totalPaise, filter.amountTo));
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

// ---- Services catalogue (ADR-067, E-3) --------------------------------------
// The priced things a clinic does that are neither a drug nor a lab test. Billing
// consumes it as a line-item source; the catalogue holds no invoice logic.

export interface ServiceInput {
  code: string;
  name: string;
  description?: string | null;
  catalogCode?: string | null;
  departmentId?: string | null;
  pricePaise: number;
  taxRateBps?: number;
}

function toServiceDto(s: typeof services.$inferSelect, departmentName: string | null) {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    description: s.description,
    departmentId: s.departmentId,
    departmentName,
    pricePaise: s.pricePaise,
    taxRateBps: s.taxRateBps,
    isActive: s.isActive,
  };
}

export async function listServices(
  tenantId: string,
  opts: { activeOnly?: boolean; search?: string; branchId?: string } = {},
) {
  const list = await runWithTenant(tenantId, async (tx) => {
    const conds = [eq(services.tenantId, tenantId)];
    if (opts.activeOnly) conds.push(eq(services.isActive, true));
    if (opts.search?.trim()) conds.push(ilike(services.name, `%${opts.search.trim()}%`));
    const rows = await tx
      .select({ s: services, departmentName: departments.name })
      .from(services)
      .leftJoin(departments, eq(departments.id, services.departmentId))
      .where(and(...conds))
      .orderBy(asc(services.name));
    return rows.map((r) => toServiceDto(r.s, r.departmentName));
  });
  // Per-hospital availability (ADR-073): filter to what this branch offers, with any price override.
  if (!opts.branchId) return list;
  const overrides = await resolveOverrides(tenantId, opts.branchId, 'service', list.map((s) => s.id));
  return list
    .filter((s) => isRefAvailable(overrides, s.id))
    .map((s) => ({ ...s, pricePaise: priceFor(overrides, s.id, s.pricePaise) }));
}

export async function createService(tenantId: string, input: ServiceInput, actorUserId?: string) {
  const created = await runWithTenant(tenantId, async (tx) => {
    if (input.departmentId) {
      const dept = (
        await tx
          .select({ id: departments.id })
          .from(departments)
          .where(and(eq(departments.tenantId, tenantId), eq(departments.id, input.departmentId)))
          .limit(1)
      )[0];
      if (!dept) throw Errors.validation(undefined, 'That department does not belong to your organization');
    }
    const rows = await tx
      .insert(services)
      .values({
        tenantId,
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        description: input.description ?? null,
        catalogCode: input.catalogCode ?? null,
        departmentId: input.departmentId ?? null,
        pricePaise: input.pricePaise,
        taxRateBps: input.taxRateBps ?? 0,
      })
      .onConflictDoNothing()
      .returning();
    if (!rows[0]) throw Errors.conflict('A service with that code already exists');
    return rows[0];
  });
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'service.create',
    resourceType: 'service',
    resourceId: created.id,
    metadata: { code: created.code, pricePaise: created.pricePaise },
  });
  const list = await listServices(tenantId);
  return list.find((s) => s.id === created.id)!;
}

export async function updateService(
  tenantId: string,
  serviceId: string,
  patch: Partial<ServiceInput> & { isActive?: boolean },
  actorUserId?: string,
) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const f of ['code', 'name', 'description', 'departmentId', 'pricePaise', 'taxRateBps', 'isActive'] as const) {
    if ((patch as Record<string, unknown>)[f] !== undefined) set[f] = (patch as Record<string, unknown>)[f];
  }
  if (typeof set.code === 'string') set.code = set.code.trim().toUpperCase();
  const updated = (
    await runWithTenant(tenantId, (tx) =>
      tx.update(services).set(set).where(and(eq(services.tenantId, tenantId), eq(services.id, serviceId))).returning(),
    )
  )[0];
  if (!updated) throw Errors.notFound('Service not found');
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'service.update',
    resourceType: 'service',
    resourceId: serviceId,
    metadata: { fields: Object.keys(set).filter((k) => k !== 'updatedAt') },
  });
  const list = await listServices(tenantId);
  return list.find((s) => s.id === serviceId)!;
}

/**
 * Add a line to an existing invoice from the catalogue (server-priced — the client sends
 * an id, never a price) or as a custom one-off. Ad-hoc lines carry no sourceModule/Ref on
 * purpose: the one-line-per-source dedupe is for clinical records, and the same service
 * can legitimately be billed twice on one visit (two dressings).
 */
export async function addServiceLine(
  tenantId: string,
  invoiceId: string,
  input: { serviceId?: string; quantity?: number; description?: string; unitPricePaise?: number; taxRateBps?: number },
  actorUserId?: string,
) {
  let line: LineItemInput;
  if (input.serviceId) {
    const svc = (
      await runWithTenant(tenantId, (tx) =>
        tx.select().from(services).where(and(eq(services.tenantId, tenantId), eq(services.id, input.serviceId!))).limit(1),
      )
    )[0];
    if (!svc) throw Errors.notFound('Service not found');
    if (!svc.isActive) throw Errors.validation(undefined, 'That service is no longer active');
    line = {
      itemType: 'service',
      description: `${svc.name} (${svc.code})`,
      quantity: input.quantity ?? 1,
      unitPricePaise: svc.pricePaise,
      taxRateBps: svc.taxRateBps,
    };
  } else {
    line = {
      itemType: 'other',
      description: input.description!,
      quantity: input.quantity ?? 1,
      unitPricePaise: input.unitPricePaise!,
      taxRateBps: input.taxRateBps ?? 0,
    };
  }
  return addInvoiceLine(tenantId, invoiceId, line, actorUserId);
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
    // Lock the invoice row: serializes concurrent collections so the balance check below cannot
    // be raced past by a second cashier (two fresh idempotency keys would otherwise overpay).
    const inv = (
      await tx.select().from(invoices).where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, invoiceId))).limit(1).for('update')
    )[0];
    if (!inv) throw Errors.notFound('Invoice not found');
    if (inv.status === 'void') throw Errors.conflict('Cannot collect against a void invoice');

    // A retried request (same idempotency key) is answered with the original result — checked
    // before the balance guards so a retry of a settling payment is not mistaken for overpay.
    const priorForKey = (
      await tx
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.tenantId, tenantId), eq(payments.idempotencyKey, input.idempotencyKey)))
        .limit(1)
    )[0];
    if (priorForKey) return { paymentId: null as string | null, deduped: true };

    const balancePaise = inv.totalPaise - inv.amountPaidPaise;
    if (balancePaise <= 0) throw Errors.conflict('This invoice is already settled');
    if (input.amountPaise > balancePaise) {
      throw Errors.validation(
        { balancePaise },
        'Payment exceeds the outstanding balance. Collect at most the balance due',
      );
    }

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
