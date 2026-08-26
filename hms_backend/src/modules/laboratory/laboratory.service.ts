import { and, asc, eq, ilike } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { labTests, labResults, labOrders, patients, visits } from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';
import { eventBus } from '../../events/eventBus';
import * as billing from '../billing/billing.service';
import { getDownloadUrl } from '../file/file.service';
import { resolveOverrides, isRefAvailable, priceFor } from '../catalog/branchAvailability.service';

// Laboratory (MVP subset). Test master + result entry against the EMR lab orders, billing at
// result, abnormal-value flag derived from the reference range.

export async function listTests(tenantId: string, search?: string, branchId?: string) {
  const list = await runWithTenant(tenantId, async (tx) => {
    const conds = [eq(labTests.tenantId, tenantId)];
    if (search && search.trim()) conds.push(ilike(labTests.name, `%${search.trim()}%`));
    const rows = await tx.select().from(labTests).where(and(...conds)).orderBy(asc(labTests.name));
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      code: t.code,
      sampleType: t.sampleType,
      unit: t.unit,
      refLow: t.refLow,
      refHigh: t.refHigh,
      pricePaise: t.pricePaise,
      taxRateBps: t.taxRateBps,
      isActive: t.isActive,
    }));
  });
  // Per-hospital availability (ADR-073): filter to what this branch offers, with any price override.
  if (!branchId) return list;
  const overrides = await resolveOverrides(tenantId, branchId, 'lab_test', list.map((t) => t.id));
  return list
    .filter((t) => isRefAvailable(overrides, t.id))
    .map((t) => ({ ...t, pricePaise: priceFor(overrides, t.id, t.pricePaise) }));
}

export interface CreateTestInput {
  name: string;
  code?: string | null;
  sampleType?: string | null;
  unit?: string | null;
  refLow?: string | null;
  refHigh?: string | null;
  catalogCode?: string | null;
  pricePaise: number;
  taxRateBps?: number;
}

export async function createTest(tenantId: string, input: CreateTestInput, actorUserId?: string) {
  const test = await runWithTenant(tenantId, async (tx) =>
    (
      await tx
        .insert(labTests)
        .values({
          tenantId,
          name: input.name,
          code: input.code ?? null,
          sampleType: input.sampleType ?? null,
          unit: input.unit ?? null,
          refLow: input.refLow ?? null,
          refHigh: input.refHigh ?? null,
          catalogCode: input.catalogCode ?? null,
          pricePaise: input.pricePaise,
          taxRateBps: input.taxRateBps ?? 0,
        })
        .returning()
    )[0]!,
  );
  await writeAudit({ tenantId, actorUserId: actorUserId ?? null, action: 'lab_test.create', resourceType: 'lab_test', resourceId: test.id, metadata: { name: test.name } });
  return listTests(tenantId, test.name).then((t) => t.find((x) => x.id === test.id));
}

function toWorklistRow(r: {
  o: typeof labOrders.$inferSelect;
  patientFirst: string;
  patientLast: string | null;
  patientUhid: string;
  resultValue: string | null;
  resultUnit: string | null;
  resultFlag: string | null;
  resultRefLow: string | null;
  resultRefHigh: string | null;
  resultNotes: string | null;
  resultVerifiedAt: Date | null;
  resultFileId: string | null;
}) {
  const o = r.o;
  return {
    id: o.id,
    testId: o.testId,
    testName: o.testName,
    testCode: o.testCode,
    priority: o.priority,
    status: o.status,
    notes: o.notes,
    visitId: o.visitId,
    patientId: o.patientId,
    patientName: `${r.patientFirst} ${r.patientLast ?? ''}`.trim(),
    patientUhid: r.patientUhid,
    createdAt: o.createdAt.toISOString(),
    result:
      r.resultValue !== null
        ? {
            value: r.resultValue,
            unit: r.resultUnit,
            flag: r.resultFlag,
            refLow: r.resultRefLow,
            refHigh: r.resultRefHigh,
            notes: r.resultNotes,
            verifiedAt: r.resultVerifiedAt ? r.resultVerifiedAt.toISOString() : null,
            hasAttachment: r.resultFileId !== null,
          }
        : null,
  };
}

const worklistColumns = {
  o: labOrders,
  patientFirst: patients.firstName,
  patientLast: patients.lastName,
  patientUhid: patients.uhid,
  resultValue: labResults.value,
  resultUnit: labResults.unit,
  resultFlag: labResults.flag,
  resultRefLow: labResults.refLow,
  resultRefHigh: labResults.refHigh,
  resultNotes: labResults.notes,
  resultVerifiedAt: labResults.verifiedAt,
  resultFileId: labResults.fileId,
};

export async function listWorklist(tenantId: string, status?: string, patientId?: string) {
  return runWithTenant(tenantId, async (tx) => {
    const conds = [eq(labOrders.tenantId, tenantId)];
    if (status) conds.push(eq(labOrders.status, status));
    if (patientId) conds.push(eq(labOrders.patientId, patientId));
    const rows = await tx
      .select(worklistColumns)
      .from(labOrders)
      .innerJoin(patients, eq(patients.id, labOrders.patientId))
      .leftJoin(labResults, eq(labResults.labOrderId, labOrders.id))
      .where(and(...conds))
      .orderBy(asc(labOrders.createdAt));
    return rows.map(toWorklistRow);
  });
}

export async function getLabOrder(tenantId: string, labOrderId: string) {
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select(worklistColumns)
      .from(labOrders)
      .innerJoin(patients, eq(patients.id, labOrders.patientId))
      .leftJoin(labResults, eq(labResults.labOrderId, labOrders.id))
      .where(and(eq(labOrders.tenantId, tenantId), eq(labOrders.id, labOrderId)))
      .limit(1);
    if (!rows[0]) throw Errors.notFound('Lab order not found');
    return toWorklistRow(rows[0]);
  });
}

// Add the lab charge for this order to the visit's invoice (creating one if the visit has
// none), exactly once — `hasSourceLine` + the invoice_line_source_unique index keep every
// path (collect, result, retries) from billing the same order twice.
async function billLabOrder(
  tenantId: string,
  order: { id: string; visitId: string; patientId: string },
  charge: { pricePaise: number; taxRateBps: number; testName: string },
  actorUserId?: string,
) {
  if (charge.pricePaise <= 0) return;
  if (await billing.hasSourceLine(tenantId, 'laboratory', order.id)) return;

  const line = {
    itemType: 'lab',
    description: `Lab: ${charge.testName}`,
    quantity: 1,
    unitPricePaise: charge.pricePaise,
    taxRateBps: charge.taxRateBps,
    sourceModule: 'laboratory',
    sourceRef: order.id,
  };
  const visitRow = await runWithTenant(tenantId, (tx) =>
    tx.select({ invoiceId: visits.invoiceId }).from(visits).where(eq(visits.id, order.visitId)).limit(1),
  );
  let invoiceId = visitRow[0]?.invoiceId ?? null;
  if (invoiceId) {
    await billing.addInvoiceLine(tenantId, invoiceId, line, actorUserId);
  } else {
    const inv = await billing.createInvoice(tenantId, { patientId: order.patientId, visitId: order.visitId, lineItems: [line] }, actorUserId);
    invoiceId = inv.id;
    await runWithTenant(tenantId, (tx) => tx.update(visits).set({ invoiceId }).where(eq(visits.id, order.visitId)));
  }
}

export async function collectSample(tenantId: string, labOrderId: string, actorUserId?: string) {
  const ctx = await runWithTenant(tenantId, async (tx) => {
    // Row lock so two concurrent collects serialize on the status check.
    const order = (
      await tx.select().from(labOrders).where(and(eq(labOrders.tenantId, tenantId), eq(labOrders.id, labOrderId))).limit(1).for('update')
    )[0];
    if (!order) throw Errors.notFound('Lab order not found');
    if (order.status !== 'ordered') throw Errors.conflict(`Cannot collect a ${order.status} order`);
    await tx.update(labOrders).set({ status: 'collected' }).where(eq(labOrders.id, labOrderId));

    // Price from the linked test master (when the doctor picked from it) — this is what lets
    // the lab charge land on the bill at collection, so payment can be taken before testing.
    let charge: { pricePaise: number; taxRateBps: number; testName: string } | null = null;
    if (order.testId) {
      const test = (await tx.select().from(labTests).where(and(eq(labTests.tenantId, tenantId), eq(labTests.id, order.testId))).limit(1))[0];
      if (test) charge = { pricePaise: test.pricePaise, taxRateBps: test.taxRateBps, testName: test.name };
    }
    return { order: { id: order.id, visitId: order.visitId, patientId: order.patientId }, charge };
  });

  if (ctx.charge) await billLabOrder(tenantId, ctx.order, ctx.charge, actorUserId);

  await writeAudit({ tenantId, actorUserId: actorUserId ?? null, action: 'lab.collect', resourceType: 'lab_order', resourceId: labOrderId, metadata: {} });
  return getLabOrder(tenantId, labOrderId);
}

function computeFlag(value: string, refLow: string | null, refHigh: string | null, passed?: string): string {
  const v = Number(value);
  const lo = refLow !== null && refLow !== '' ? Number(refLow) : NaN;
  const hi = refHigh !== null && refHigh !== '' ? Number(refHigh) : NaN;
  if (!Number.isNaN(v)) {
    if (!Number.isNaN(lo) && v < lo) return 'low';
    if (!Number.isNaN(hi) && v > hi) return 'high';
    if (!Number.isNaN(lo) || !Number.isNaN(hi)) return 'normal';
  }
  return passed ?? 'normal';
}

export interface EnterResultInput {
  testId?: string | null;
  value: string;
  unit?: string | null;
  refLow?: string | null;
  refHigh?: string | null;
  flag?: string | null;
  notes?: string | null;
  /** Attached report file (uploaded through the file module first). */
  fileId?: string | null;
}

export async function enterResult(tenantId: string, labOrderId: string, input: EnterResultInput, actorUserId?: string) {
  const ctx = await runWithTenant(tenantId, async (tx) => {
    const order = (
      await tx.select().from(labOrders).where(and(eq(labOrders.tenantId, tenantId), eq(labOrders.id, labOrderId))).limit(1).for('update')
    )[0];
    if (!order) throw Errors.notFound('Lab order not found');
    // Transition rule: results are entered on a collected sample, or re-entered to correct an
    // already-resulted/verified order (ADR-060 correction path — a corrected value drops back
    // to `resulted` and needs re-verification). Never on ordered/cancelled.
    if (order.status === 'ordered') throw Errors.conflict('Collect the sample before entering a result');
    if (order.status === 'cancelled') throw Errors.conflict('Cannot enter a result on a cancelled order');
    const wasResulted = order.status === 'resulted' || order.status === 'verified';

    let pricePaise = 0;
    let taxRateBps = 0;
    let refLow = input.refLow ?? null;
    let refHigh = input.refHigh ?? null;
    let unit = input.unit ?? null;
    let testName = order.testName;
    // The master to price/reference against: the technician's explicit pick wins, else the
    // test the doctor ordered from the catalogue.
    const effectiveTestId = input.testId ?? order.testId ?? null;
    if (effectiveTestId) {
      const test = (await tx.select().from(labTests).where(and(eq(labTests.tenantId, tenantId), eq(labTests.id, effectiveTestId))).limit(1))[0];
      if (!test) throw Errors.notFound('Lab test not found');
      pricePaise = test.pricePaise;
      taxRateBps = test.taxRateBps;
      refLow = refLow ?? test.refLow;
      refHigh = refHigh ?? test.refHigh;
      unit = unit ?? test.unit;
      testName = test.name;
    }
    const flag = computeFlag(input.value, refLow, refHigh, input.flag ?? undefined);

    await tx.delete(labResults).where(and(eq(labResults.tenantId, tenantId), eq(labResults.labOrderId, labOrderId)));
    await tx.insert(labResults).values({
      tenantId,
      labOrderId,
      testId: effectiveTestId,
      value: input.value,
      unit,
      refLow,
      refHigh,
      flag,
      notes: input.notes ?? null,
      fileId: input.fileId ?? null,
      resultedBy: actorUserId ?? null,
      // A fresh (or corrected) result is unverified by construction — verification is its
      // own sign-off, and re-entry always drops the order back to `resulted`.
    });
    await tx.update(labOrders).set({ status: 'resulted' }).where(eq(labOrders.id, labOrderId));

    return { wasResulted, visitId: order.visitId, patientId: order.patientId, pricePaise, taxRateBps, testName, flag };
  });

  // Bill once if not already billed at collection (free-text orders get priced here, when the
  // technician matches the master). `billLabOrder` dedupes, so this is safe on re-entry too.
  await billLabOrder(
    tenantId,
    { id: labOrderId, visitId: ctx.visitId, patientId: ctx.patientId },
    { pricePaise: ctx.pricePaise, taxRateBps: ctx.taxRateBps, testName: ctx.testName },
    actorUserId,
  );

  if (!ctx.wasResulted) {
    eventBus.publish('lab.result_ready', { tenantId, labOrderId, patientId: ctx.patientId });
  }
  await writeAudit({ tenantId, actorUserId: actorUserId ?? null, action: 'lab.result', resourceType: 'lab_order', resourceId: labOrderId, metadata: { flag: ctx.flag } });
  return getLabOrder(tenantId, labOrderId);
}

/**
 * Sign off a resulted order (ADR-070). Verification is what releases the report to the
 * patient portal; the doctor's own view never waited on it. Only a `resulted` order can
 * verify, and a corrected result always needs a fresh sign-off.
 */
export async function verifyResult(tenantId: string, labOrderId: string, actorUserId?: string) {
  const patientId = await runWithTenant(tenantId, async (tx) => {
    const order = (
      await tx.select().from(labOrders).where(and(eq(labOrders.tenantId, tenantId), eq(labOrders.id, labOrderId))).limit(1).for('update')
    )[0];
    if (!order) throw Errors.notFound('Lab order not found');
    if (order.status !== 'resulted') throw Errors.conflict(`Cannot verify a ${order.status} order`);
    await tx.update(labOrders).set({ status: 'verified' }).where(eq(labOrders.id, labOrderId));
    await tx
      .update(labResults)
      .set({ verifiedBy: actorUserId ?? null, verifiedAt: new Date() })
      .where(and(eq(labResults.tenantId, tenantId), eq(labResults.labOrderId, labOrderId)));
    return order.patientId;
  });
  // Verification is what releases the report to the patient portal (ADR-070) — the point at which
  // the patient may be told it's ready. Published once, here (not on raw result entry).
  eventBus.publish('lab.result_verified', { tenantId, labOrderId, patientId });
  await writeAudit({ tenantId, actorUserId: actorUserId ?? null, action: 'lab.verify', resourceType: 'lab_order', resourceId: labOrderId, metadata: {} });
  return getLabOrder(tenantId, labOrderId);
}

/** Short-lived download URL for the attached report (staff side). */
export async function getReportAttachmentUrl(tenantId: string, labOrderId: string): Promise<string | null> {
  const row = (
    await runWithTenant(tenantId, (tx) =>
      tx
        .select({ fileId: labResults.fileId })
        .from(labResults)
        .where(and(eq(labResults.tenantId, tenantId), eq(labResults.labOrderId, labOrderId)))
        .limit(1),
    )
  )[0];
  if (!row?.fileId) return null;
  const url = await getDownloadUrl(tenantId, row.fileId);
  return url?.url ?? null;
}
