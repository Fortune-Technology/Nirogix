import { and, asc, eq, gt, ilike, sql } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { drugs, drugBatches, dispenses, prescriptions, encounters, visits, patients } from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';
import * as billing from '../billing/billing.service';

// Pharmacy (MVP subset). Drug master + FEFO batch stock + dispense-against-prescription that
// extends Billing Core with a pharmacy line item.

export async function listDrugs(tenantId: string, search?: string) {
  return runWithTenant(tenantId, async (tx) => {
    const conds = [eq(drugs.tenantId, tenantId)];
    if (search && search.trim()) conds.push(ilike(drugs.name, `%${search.trim()}%`));
    const rows = await tx
      .select({ d: drugs, onHand: sql<number>`coalesce(sum(${drugBatches.quantity}), 0)` })
      .from(drugs)
      .leftJoin(drugBatches, eq(drugBatches.drugId, drugs.id))
      .where(and(...conds))
      .groupBy(drugs.id)
      .orderBy(asc(drugs.name));
    return rows.map((r) => {
      const onHand = Number(r.onHand);
      return {
        id: r.d.id,
        name: r.d.name,
        form: r.d.form,
        strength: r.d.strength,
        unit: r.d.unit,
        unitPricePaise: r.d.unitPricePaise,
        taxRateBps: r.d.taxRateBps,
        reorderLevel: r.d.reorderLevel,
        isActive: r.d.isActive,
        onHand,
        lowStock: r.d.reorderLevel > 0 && onHand <= r.d.reorderLevel,
      };
    });
  });
}

export interface CreateDrugInput {
  name: string;
  form?: string | null;
  strength?: string | null;
  unit?: string;
  hsnSac?: string | null;
  unitPricePaise: number;
  taxRateBps?: number;
  reorderLevel?: number;
}

export async function createDrug(tenantId: string, input: CreateDrugInput, actorUserId?: string) {
  const drug = await runWithTenant(tenantId, async (tx) => {
    return (
      await tx
        .insert(drugs)
        .values({
          tenantId,
          name: input.name,
          form: input.form ?? null,
          strength: input.strength ?? null,
          unit: input.unit ?? 'unit',
          hsnSac: input.hsnSac ?? null,
          unitPricePaise: input.unitPricePaise,
          taxRateBps: input.taxRateBps ?? 0,
          reorderLevel: input.reorderLevel ?? 0,
        })
        .returning()
    )[0]!;
  });
  await writeAudit({ tenantId, actorUserId: actorUserId ?? null, action: 'drug.create', resourceType: 'drug', resourceId: drug.id, metadata: { name: drug.name } });
  return listDrugs(tenantId, drug.name).then((d) => d.find((x) => x.id === drug.id));
}

export interface ReceiveStockInput {
  batchNo?: string | null;
  expiryDate?: string | null;
  quantity: number;
  costPricePaise?: number | null;
}

export async function receiveStock(tenantId: string, drugId: string, input: ReceiveStockInput, actorUserId?: string) {
  await runWithTenant(tenantId, async (tx) => {
    const drug = (await tx.select({ id: drugs.id }).from(drugs).where(and(eq(drugs.tenantId, tenantId), eq(drugs.id, drugId))).limit(1))[0];
    if (!drug) throw Errors.notFound('Drug not found');
    await tx.insert(drugBatches).values({
      tenantId,
      drugId,
      batchNo: input.batchNo ?? null,
      expiryDate: input.expiryDate ?? null,
      quantity: input.quantity,
      costPricePaise: input.costPricePaise ?? null,
    });
  });
  await writeAudit({ tenantId, actorUserId: actorUserId ?? null, action: 'stock.receive', resourceType: 'drug', resourceId: drugId, metadata: { quantity: input.quantity } });
  return listDrugs(tenantId).then((d) => d.find((x) => x.id === drugId));
}

// The dispensing worklist — prescriptions awaiting dispense (status 'ordered') from SIGNED
// encounters only. A draft consultation is still being written: its rows are not yet orders,
// and surfacing them would let pharmacy act on medication the doctor may still change.
export async function listPendingPrescriptions(tenantId: string) {
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        p: prescriptions,
        patientFirst: patients.firstName,
        patientLast: patients.lastName,
        patientUhid: patients.uhid,
      })
      .from(prescriptions)
      .innerJoin(patients, eq(patients.id, prescriptions.patientId))
      .innerJoin(encounters, eq(encounters.id, prescriptions.encounterId))
      .where(and(eq(prescriptions.tenantId, tenantId), eq(prescriptions.status, 'ordered'), eq(encounters.status, 'signed')))
      .orderBy(asc(prescriptions.createdAt));
    return rows.map((r) => ({
      id: r.p.id,
      drugId: r.p.drugId,
      drugName: r.p.drugName,
      dose: r.p.dose,
      frequency: r.p.frequency,
      duration: r.p.duration,
      route: r.p.route,
      instructions: r.p.instructions,
      status: r.p.status,
      visitId: r.p.visitId,
      patientId: r.p.patientId,
      patientName: `${r.patientFirst} ${r.patientLast ?? ''}`.trim(),
      patientUhid: r.patientUhid,
      createdAt: r.p.createdAt.toISOString(),
    }));
  });
}

export interface DispenseInput {
  prescriptionId: string;
  drugId: string;
  quantity: number;
}

export async function dispense(tenantId: string, input: DispenseInput, actorUserId?: string) {
  if (input.quantity <= 0) throw Errors.validation(undefined, 'Quantity must be positive');

  // 1) Deduct stock (FEFO), mark the prescription dispensed, record the dispense.
  const ctx = await runWithTenant(tenantId, async (tx) => {
    // Row lock: two concurrent dispenses of the same prescription must serialize here, so the
    // status check below cannot be raced past (double-dispense guard is a lock, not a hope).
    const rx = (
      await tx
        .select()
        .from(prescriptions)
        .where(and(eq(prescriptions.tenantId, tenantId), eq(prescriptions.id, input.prescriptionId)))
        .limit(1)
        .for('update')
    )[0];
    if (!rx) throw Errors.notFound('Prescription not found');
    if (rx.status !== 'ordered') throw Errors.conflict('This prescription has already been dispensed or cancelled');

    // Only signed consultations are dispensable — the worklist filters drafts out, and this
    // re-checks it server-side so a direct API call cannot jump the rule.
    const enc = (
      await tx
        .select({ status: encounters.status })
        .from(encounters)
        .where(and(eq(encounters.tenantId, tenantId), eq(encounters.id, rx.encounterId)))
        .limit(1)
    )[0];
    if (!enc || enc.status !== 'signed') {
      throw Errors.conflict('This prescription belongs to a consultation that is not signed yet');
    }

    const drug = (await tx.select().from(drugs).where(and(eq(drugs.tenantId, tenantId), eq(drugs.id, input.drugId))).limit(1))[0];
    if (!drug) throw Errors.notFound('Drug not found');

    // Lock the batches being drawn down — concurrent dispenses of the same drug otherwise
    // read the same quantities and both deduct.
    const batches = await tx
      .select()
      .from(drugBatches)
      .where(and(eq(drugBatches.tenantId, tenantId), eq(drugBatches.drugId, input.drugId), gt(drugBatches.quantity, 0)))
      .orderBy(asc(drugBatches.expiryDate)) // FEFO (Postgres ASC → NULLs last, so dated batches go first)
      .for('update');

    const onHand = batches.reduce((s, b) => s + b.quantity, 0);
    if (onHand < input.quantity) throw Errors.conflict(`Insufficient stock — ${onHand} in hand, ${input.quantity} requested`);

    let remaining = input.quantity;
    for (const b of batches) {
      if (remaining <= 0) break;
      const take = Math.min(b.quantity, remaining);
      await tx.update(drugBatches).set({ quantity: b.quantity - take }).where(eq(drugBatches.id, b.id));
      remaining -= take;
    }

    await tx.update(prescriptions).set({ status: 'dispensed' }).where(eq(prescriptions.id, rx.id));

    const total = drug.unitPricePaise * input.quantity;
    const dispenseRow = (
      await tx
        .insert(dispenses)
        .values({
          tenantId,
          prescriptionId: rx.id,
          visitId: rx.visitId,
          patientId: rx.patientId,
          drugId: drug.id,
          quantity: input.quantity,
          unitPricePaise: drug.unitPricePaise,
          totalPaise: total,
          dispensedBy: actorUserId ?? null,
        })
        .returning({ id: dispenses.id })
    )[0]!;

    return {
      dispenseId: dispenseRow.id,
      visitId: rx.visitId,
      patientId: rx.patientId,
      drugName: drug.name,
      unitPricePaise: drug.unitPricePaise,
      taxRateBps: drug.taxRateBps,
      prescriptionId: rx.id,
      // The doctor picked a specific drug and the pharmacist dispensed a different one.
      substituted: rx.drugId !== null && rx.drugId !== input.drugId,
    };
  });

  // 2) Bill it — add a pharmacy line to the visit's invoice (extends Billing Core).
  const line = {
    itemType: 'pharmacy',
    description: `${ctx.drugName} × ${input.quantity}`,
    quantity: input.quantity,
    unitPricePaise: ctx.unitPricePaise,
    taxRateBps: ctx.taxRateBps,
    sourceModule: 'pharmacy',
    sourceRef: ctx.prescriptionId,
  };

  let invoiceId: string | null = null;
  const visit = await runWithTenant(tenantId, (tx) =>
    tx.select({ invoiceId: visits.invoiceId }).from(visits).where(eq(visits.id, ctx.visitId!)).limit(1),
  );
  invoiceId = visit[0]?.invoiceId ?? null;

  if (invoiceId) {
    await billing.addInvoiceLine(tenantId, invoiceId, line, actorUserId);
  } else {
    const inv = await billing.createInvoice(tenantId, { patientId: ctx.patientId, visitId: ctx.visitId, lineItems: [line] }, actorUserId);
    invoiceId = inv.id;
    await runWithTenant(tenantId, (tx) => tx.update(visits).set({ invoiceId }).where(eq(visits.id, ctx.visitId!)));
  }

  await runWithTenant(tenantId, (tx) => tx.update(dispenses).set({ invoiceId }).where(eq(dispenses.id, ctx.dispenseId)));
  await writeAudit({
    tenantId,
    actorUserId: actorUserId ?? null,
    action: 'pharmacy.dispense',
    resourceType: 'dispense',
    resourceId: ctx.dispenseId,
    metadata: { prescriptionId: ctx.prescriptionId, drugId: input.drugId, quantity: input.quantity, invoiceId, substituted: ctx.substituted },
  });

  return { dispenseId: ctx.dispenseId, invoiceId, drugName: ctx.drugName, quantity: input.quantity, totalPaise: ctx.unitPricePaise * input.quantity };
}
