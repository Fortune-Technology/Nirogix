import { and, asc, eq, ilike } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { labTests, labResults, labOrders, patients, visits } from '../../db/schema';
import { Errors } from '../../http/error';
import { writeAudit } from '../audit/audit.service';
import { eventBus } from '../../events/eventBus';
import * as billing from '../billing/billing.service';

// Laboratory (MVP subset). Test master + result entry against the EMR lab orders, billing at
// result, abnormal-value flag derived from the reference range.

export async function listTests(tenantId: string, search?: string) {
  return runWithTenant(tenantId, async (tx) => {
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
}

export interface CreateTestInput {
  name: string;
  code?: string | null;
  sampleType?: string | null;
  unit?: string | null;
  refLow?: string | null;
  refHigh?: string | null;
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
}) {
  const o = r.o;
  return {
    id: o.id,
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
        ? { value: r.resultValue, unit: r.resultUnit, flag: r.resultFlag, refLow: r.resultRefLow, refHigh: r.resultRefHigh, notes: r.resultNotes }
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
};

export async function listWorklist(tenantId: string, status?: string) {
  return runWithTenant(tenantId, async (tx) => {
    const conds = [eq(labOrders.tenantId, tenantId)];
    if (status) conds.push(eq(labOrders.status, status));
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

export async function collectSample(tenantId: string, labOrderId: string, actorUserId?: string) {
  await runWithTenant(tenantId, async (tx) => {
    const order = (await tx.select().from(labOrders).where(and(eq(labOrders.tenantId, tenantId), eq(labOrders.id, labOrderId))).limit(1))[0];
    if (!order) throw Errors.notFound('Lab order not found');
    if (order.status !== 'ordered') throw Errors.conflict(`Cannot collect a ${order.status} order`);
    await tx.update(labOrders).set({ status: 'collected' }).where(eq(labOrders.id, labOrderId));
  });
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
}

export async function enterResult(tenantId: string, labOrderId: string, input: EnterResultInput, actorUserId?: string) {
  const ctx = await runWithTenant(tenantId, async (tx) => {
    const order = (await tx.select().from(labOrders).where(and(eq(labOrders.tenantId, tenantId), eq(labOrders.id, labOrderId))).limit(1))[0];
    if (!order) throw Errors.notFound('Lab order not found');
    const wasResulted = order.status === 'resulted';

    let pricePaise = 0;
    let taxRateBps = 0;
    let refLow = input.refLow ?? null;
    let refHigh = input.refHigh ?? null;
    let unit = input.unit ?? null;
    let testName = order.testName;
    if (input.testId) {
      const test = (await tx.select().from(labTests).where(and(eq(labTests.tenantId, tenantId), eq(labTests.id, input.testId))).limit(1))[0];
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
      testId: input.testId ?? null,
      value: input.value,
      unit,
      refLow,
      refHigh,
      flag,
      notes: input.notes ?? null,
      resultedBy: actorUserId ?? null,
    });
    await tx.update(labOrders).set({ status: 'resulted' }).where(eq(labOrders.id, labOrderId));

    return { wasResulted, visitId: order.visitId, patientId: order.patientId, pricePaise, taxRateBps, testName, flag };
  });

  // Bill once, on first result, if the test carries a price (extends Billing Core).
  if (!ctx.wasResulted && ctx.pricePaise > 0) {
    const line = {
      itemType: 'lab',
      description: `Lab: ${ctx.testName}`,
      quantity: 1,
      unitPricePaise: ctx.pricePaise,
      taxRateBps: ctx.taxRateBps,
      sourceModule: 'laboratory',
      sourceRef: labOrderId,
    };
    const visitRow = await runWithTenant(tenantId, (tx) =>
      tx.select({ invoiceId: visits.invoiceId }).from(visits).where(eq(visits.id, ctx.visitId)).limit(1),
    );
    let invoiceId = visitRow[0]?.invoiceId ?? null;
    if (invoiceId) {
      await billing.addInvoiceLine(tenantId, invoiceId, line, actorUserId);
    } else {
      const inv = await billing.createInvoice(tenantId, { patientId: ctx.patientId, visitId: ctx.visitId, lineItems: [line] }, actorUserId);
      invoiceId = inv.id;
      await runWithTenant(tenantId, (tx) => tx.update(visits).set({ invoiceId }).where(eq(visits.id, ctx.visitId)));
    }
  }

  if (!ctx.wasResulted) {
    eventBus.publish('lab.result_ready', { tenantId, labOrderId, patientId: ctx.patientId });
  }
  await writeAudit({ tenantId, actorUserId: actorUserId ?? null, action: 'lab.result', resourceType: 'lab_order', resourceId: labOrderId, metadata: { flag: ctx.flag } });
  return getLabOrder(tenantId, labOrderId);
}
