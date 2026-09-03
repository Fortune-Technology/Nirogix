import { and, asc, eq, sql } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import { visits, patients, providers, invoices, payments, labOrders } from '../../db/schema';

// Basic Reports (development-plan §53, MVP subset). Read-only aggregates over the data the
// clinic slices produced — no new tables, tenant-scoped through RLS.

const patientName = sql<string>`${patients.firstName} || ' ' || coalesce(${patients.lastName}, '')`;

export async function opdRegister(tenantId: string, from: string, to: string) {
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        visitNumber: visits.visitNumber,
        tokenNumber: visits.tokenNumber,
        visitDate: visits.visitDate,
        status: visits.status,
        checkedInAt: visits.checkedInAt,
        patientName,
        patientUhid: patients.uhid,
        providerName: providers.fullName,
        invoiceNumber: invoices.invoiceNumber,
        invoiceTotalPaise: invoices.totalPaise,
        invoicePaidPaise: invoices.amountPaidPaise,
        invoiceStatus: invoices.status,
      })
      .from(visits)
      .innerJoin(patients, eq(patients.id, visits.patientId))
      .leftJoin(providers, eq(providers.id, visits.providerId))
      .leftJoin(invoices, eq(invoices.id, visits.invoiceId))
      .where(and(eq(visits.tenantId, tenantId), sql`${visits.visitDate} between ${from} and ${to}`))
      .orderBy(asc(visits.visitDate), asc(visits.tokenNumber));

    return rows.map((r) => ({
      visitNumber: r.visitNumber,
      tokenNumber: r.tokenNumber,
      visitDate: r.visitDate,
      patientName: r.patientName,
      patientUhid: r.patientUhid,
      providerName: r.providerName,
      status: r.status,
      checkedInAt: r.checkedInAt.toISOString(),
      invoiceNumber: r.invoiceNumber,
      invoiceTotalPaise: r.invoiceTotalPaise,
      invoicePaidPaise: r.invoicePaidPaise,
      invoiceStatus: r.invoiceStatus,
    }));
  });
}

export async function collections(tenantId: string, from: string, to: string) {
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: payments.id,
        collectedAt: payments.collectedAt,
        method: payments.method,
        amountPaise: payments.amountPaise,
        reference: payments.reference,
        invoiceNumber: invoices.invoiceNumber,
        patientName,
        patientUhid: patients.uhid,
      })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .innerJoin(patients, eq(patients.id, invoices.patientId))
      .where(
        and(
          eq(payments.tenantId, tenantId),
          eq(payments.status, 'captured'),
          sql`${payments.collectedAt}::date between ${from} and ${to}`,
        ),
      )
      .orderBy(asc(payments.collectedAt));

    const byMethodMap = new Map<string, { totalPaise: number; count: number }>();
    const byDayMap = new Map<string, { totalPaise: number; count: number }>();
    let totalPaise = 0;
    for (const r of rows) {
      totalPaise += r.amountPaise;
      const m = byMethodMap.get(r.method) ?? { totalPaise: 0, count: 0 };
      byMethodMap.set(r.method, { totalPaise: m.totalPaise + r.amountPaise, count: m.count + 1 });
      const day = r.collectedAt.toISOString().slice(0, 10);
      const d = byDayMap.get(day) ?? { totalPaise: 0, count: 0 };
      byDayMap.set(day, { totalPaise: d.totalPaise + r.amountPaise, count: d.count + 1 });
    }

    return {
      from,
      to,
      totalPaise,
      count: rows.length,
      byMethod: [...byMethodMap.entries()].map(([method, v]) => ({ method, ...v })),
      byDay: [...byDayMap.entries()].sort().map(([date, v]) => ({ date, ...v })),
      rows: rows.map((r) => ({
        id: r.id,
        collectedAt: r.collectedAt.toISOString(),
        method: r.method,
        amountPaise: r.amountPaise,
        reference: r.reference,
        invoiceNumber: r.invoiceNumber,
        patientName: r.patientName,
        patientUhid: r.patientUhid,
      })),
    };
  });
}

export async function pendingLabs(tenantId: string) {
  return runWithTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        testName: labOrders.testName,
        testCode: labOrders.testCode,
        priority: labOrders.priority,
        status: labOrders.status,
        createdAt: labOrders.createdAt,
        patientName,
        patientUhid: patients.uhid,
      })
      .from(labOrders)
      .innerJoin(patients, eq(patients.id, labOrders.patientId))
      .where(
        and(eq(labOrders.tenantId, tenantId), sql`${labOrders.status} in ('ordered', 'collected')`),
      )
      .orderBy(asc(labOrders.createdAt));

    return rows.map((r) => ({
      testName: r.testName,
      testCode: r.testCode,
      priority: r.priority,
      status: r.status,
      patientName: r.patientName,
      patientUhid: r.patientUhid,
      orderedAt: r.createdAt.toISOString(),
    }));
  });
}
