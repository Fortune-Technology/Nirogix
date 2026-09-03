import { and, count, eq, gte, sql } from 'drizzle-orm';
import { runWithTenant } from '../../db/tenantContext';
import {
  appointments,
  invoices,
  labOrders,
  patients,
  payments,
  providers,
  visits,
  drugs,
  drugBatches,
} from '../../db/schema';

/**
 * The hospital's own operational overview — the data behind every role dashboard
 * (ADR-044). RLS-scoped through `runWithTenant`, so a hospital only ever sees
 * itself; nothing here is aggregated across tenants.
 *
 * Same rule as the platform dashboard (ADR-043): **every number is a real query.**
 * A metric with no source does not get a field, and a period with no rows is a
 * zero rather than an interpolated point.
 */

export type HourPoint = { hour: number; scheduled: number; walkIn: number };
export type RevenuePoint = { period: string; billed: number; collected: number };
export type CountPoint = { period: string; value: number };

export type LowStockItem = { id: string; name: string; onHand: number; reorderLevel: number };
export type ProviderLoad = {
  providerId: string;
  name: string;
  seen: number;
  inProgress: number;
  booked: number;
};

export type DashboardOverview = {
  /** The clinical day this describes, `YYYY-MM-DD` in server time. */
  today: string;
  /** Today's OPD load by hour of day — check-ins split by whether they had a booking. */
  loadByHour: HourPoint[];
  today_counts: {
    appointments: number;
    checkedIn: number;
    inConsultation: number;
    completed: number;
    newPatients: number;
  };
  /** Billed vs collected per day over the requested window, in paise. */
  revenue: RevenuePoint[];
  /** Patients registered per day over the same window. */
  registrations: CountPoint[];
  outstandingPaise: number;
  pendingLabOrders: number;
  lowStock: LowStockItem[];
  providerLoad: ProviderLoad[];
};

/** `YYYY-MM-DD` for a date, in server-local time — the clinical day, not UTC. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The last `days` day keys, oldest first, ending today. */
function dayWindow(days: number, now: Date): string[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    keys.push(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
  }
  return keys;
}

/**
 * Day keys from `from` to `to` inclusive (both `YYYY-MM-DD`, local calendar), oldest
 * first. Capped at 366 days so a hand-crafted request cannot force an unbounded daily
 * scan (the same ceiling the reports endpoints use).
 */
function rangeWindow(from: string, to: string): { window: string[]; windowStart: Date } {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const start = new Date(fy!, fm! - 1, fd!);
  const end = new Date(ty!, tm! - 1, td!);
  const keys: string[] = [];
  for (const cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1))
    keys.push(dayKey(cur));
  const capped = keys.length > 366 ? keys.slice(-366) : keys;
  const [sy, sm, sd] = (capped[0] ?? dayKey(start)).split('-').map(Number);
  return { window: capped, windowStart: new Date(sy!, sm! - 1, sd!) };
}

/** The window a request asked for — a rolling `days` count, or an explicit inclusive `{ from, to }`. */
export type OverviewRange = number | { from: string; to: string };

export async function getDashboardOverview(
  tenantId: string,
  range: OverviewRange,
  now = new Date(),
): Promise<DashboardOverview> {
  const today = dayKey(now);
  const { window, windowStart } =
    typeof range === 'object'
      ? rangeWindow(range.from, range.to)
      : {
          window: dayWindow(range, now),
          windowStart: new Date(now.getFullYear(), now.getMonth(), now.getDate() - (range - 1)),
        };

  return runWithTenant(tenantId, async (tx) => {
    const scope = (col: { tenantId: unknown }) => eq(col.tenantId as never, tenantId);

    // --- Today: the queue, by hour and by status --------------------------------
    const todayVisits = await tx
      .select({
        checkedInAt: visits.checkedInAt,
        status: visits.status,
        appointmentId: visits.appointmentId,
        providerId: visits.providerId,
      })
      .from(visits)
      .where(and(scope(visits), eq(visits.visitDate, today)));

    const hours = new Map<number, HourPoint>();
    for (let h = 0; h < 24; h++) hours.set(h, { hour: h, scheduled: 0, walkIn: 0 });
    for (const v of todayVisits) {
      const bucket = hours.get(new Date(v.checkedInAt).getHours());
      if (!bucket) continue;
      if (v.appointmentId) bucket.scheduled += 1;
      else bucket.walkIn += 1;
    }

    const todayAppointments = (
      await tx
        .select({ c: count() })
        .from(appointments)
        .where(and(scope(appointments), sql`date(${appointments.scheduledAt}) = ${today}`))
    )[0];

    const newPatients = (
      await tx
        .select({ c: count() })
        .from(patients)
        .where(and(scope(patients), sql`date(${patients.createdAt}) = ${today}`))
    )[0];

    // --- Revenue: billed vs collected per day -----------------------------------
    const invoiceRows = await tx
      .select({ at: invoices.createdAt, total: invoices.totalPaise })
      .from(invoices)
      .where(and(scope(invoices), gte(invoices.createdAt, windowStart)));
    const paymentRows = await tx
      .select({ at: payments.createdAt, amount: payments.amountPaise })
      .from(payments)
      .where(and(scope(payments), gte(payments.createdAt, windowStart)));

    const revenue = new Map<string, RevenuePoint>(
      window.map((period) => [period, { period, billed: 0, collected: 0 }]),
    );
    for (const r of invoiceRows) {
      const b = revenue.get(dayKey(new Date(r.at)));
      if (b) b.billed += Number(r.total ?? 0);
    }
    for (const r of paymentRows) {
      const b = revenue.get(dayKey(new Date(r.at)));
      if (b) b.collected += Number(r.amount ?? 0);
    }

    // Outstanding across every open invoice, not just the window.
    const openInvoices = await tx
      .select({
        total: invoices.totalPaise,
        paid: invoices.amountPaidPaise,
        status: invoices.status,
      })
      .from(invoices)
      .where(scope(invoices));
    const outstandingPaise = openInvoices
      .filter((i) => i.status !== 'void')
      .reduce((sum, i) => sum + Math.max(0, Number(i.total ?? 0) - Number(i.paid ?? 0)), 0);

    // --- Registrations per day ---------------------------------------------------
    const patientRows = await tx
      .select({ at: patients.createdAt })
      .from(patients)
      .where(and(scope(patients), gte(patients.createdAt, windowStart)));
    const registrations = new Map<string, CountPoint>(
      window.map((period) => [period, { period, value: 0 }]),
    );
    for (const r of patientRows) {
      const b = registrations.get(dayKey(new Date(r.at)));
      if (b) b.value += 1;
    }

    // --- Work waiting on someone -------------------------------------------------
    const pendingLabs = (
      await tx
        .select({ c: count() })
        .from(labOrders)
        .where(and(scope(labOrders), sql`${labOrders.status} in ('ordered','collected')`))
    )[0];

    const drugRows = await tx
      .select({
        id: drugs.id,
        name: drugs.name,
        reorderLevel: drugs.reorderLevel,
        onHand: sql<number>`coalesce(sum(${drugBatches.quantity}), 0)`,
      })
      .from(drugs)
      .leftJoin(drugBatches, eq(drugBatches.drugId, drugs.id))
      .where(scope(drugs))
      .groupBy(drugs.id, drugs.name, drugs.reorderLevel);
    const lowStock = drugRows
      .map((d) => ({
        id: d.id,
        name: d.name,
        onHand: Number(d.onHand ?? 0),
        reorderLevel: Number(d.reorderLevel ?? 0),
      }))
      .filter((d) => d.reorderLevel > 0 && d.onHand <= d.reorderLevel)
      .sort((a, b) => a.onHand - b.onHand)
      .slice(0, 8);

    // --- Who is carrying today's clinic ------------------------------------------
    const providerRows = await tx
      .select({ id: providers.id, fullName: providers.fullName })
      .from(providers)
      .where(scope(providers));
    const byProvider = new Map<string, ProviderLoad>();
    for (const p of providerRows) {
      byProvider.set(p.id, {
        providerId: p.id,
        name: p.fullName,
        seen: 0,
        inProgress: 0,
        booked: 0,
      });
    }
    for (const v of todayVisits) {
      if (!v.providerId) continue;
      const row = byProvider.get(v.providerId);
      if (!row) continue;
      if (v.status === 'completed') row.seen += 1;
      else if (v.status === 'in_consultation') row.inProgress += 1;
      row.booked += 1;
    }

    return {
      today,
      loadByHour: [...hours.values()],
      today_counts: {
        appointments: Number(todayAppointments?.c ?? 0),
        checkedIn: todayVisits.filter((v) => v.status === 'checked_in').length,
        inConsultation: todayVisits.filter((v) => v.status === 'in_consultation').length,
        completed: todayVisits.filter((v) => v.status === 'completed').length,
        newPatients: Number(newPatients?.c ?? 0),
      },
      revenue: [...revenue.values()],
      registrations: [...registrations.values()],
      outstandingPaise,
      pendingLabOrders: Number(pendingLabs?.c ?? 0),
      lowStock,
      providerLoad: [...byProvider.values()]
        .filter((p) => p.booked > 0)
        .sort((a, b) => b.booked - a.booked),
    };
  });
}

export const __testables = { dayKey, dayWindow };
