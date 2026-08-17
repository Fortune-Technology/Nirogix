"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ClipboardList,
  FlaskConical,
  Package,
  Plus,
  Stethoscope,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { AreaChart, BarChart, Button, Card, StatCard, UsageBar, type Series } from "@hms/ui";
import type { DashboardOverview, OrgSummary } from "@hms/types";
import * as api from "../../lib/api";
import { formatDate, formatDayLabel, formatWeekday } from "@hms/utils";
import { formatPaise } from "../../lib/money";
import { DashboardRow, DashboardShell, KpiGrid, PanelEmpty, PanelRow, RangeChips, firstName } from "./DashboardShell";
import { SetupProgressCard } from "../settings/SetupChecklist";

/**
 * The Hospital Admin dashboard (ADR-044) — one hospital's day and its trend,
 * built on the shared dashboard layout so it reads like every other role's.
 *
 * Every tile is a real query against the hospital's own data (RLS-scoped):
 * `GET /dashboard/overview` for the operational picture, `GET /dashboard/summary`
 * for the roll-up counts. The reference design's IPD, theatre, department and
 * approval panels are **not** rendered — there is no in-patient, operating-theatre,
 * department or approval-workflow model in the product, and drawing them with
 * invented numbers is the one thing a dashboard must never do (ADR-043).
 */

const BRAND = "var(--hms-brand)";
const INFO = "var(--hms-info)";
const SUCCESS = "var(--hms-success)";

const RANGES = [
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
] as const;

/** Clinic hours only: a 24-bar axis of mostly zeros hides the shape of the day. */
const CLINIC_HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 07:00 … 20:00

export function HospitalAdminDashboard({ fullName }: { fullName?: string }) {
  const [days, setDays] = useState<number>(14);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [summary, setSummary] = useState<OrgSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (range: number) => {
    try {
      const [o, s] = await Promise.all([api.getDashboardOverview(range), api.getOrgSummary()]);
      setOverview(o);
      setSummary(s);
      setError(null);
    } catch {
      setError("Could not load the dashboard.");
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [load, days]);

  const revenueLabels = useMemo(() => (overview?.revenue ?? []).map((p) => formatDayLabel(p.period)), [overview]);
  const revenueSeries: Series[] = useMemo(
    () => [
      { key: "billed", label: "Billed", values: (overview?.revenue ?? []).map((p) => p.billed / 100), color: BRAND },
      {
        key: "collected",
        label: "Collected",
        values: (overview?.revenue ?? []).map((p) => p.collected / 100),
        color: SUCCESS,
      },
    ],
    [overview],
  );

  const hourSeries: Series[] = useMemo(() => {
    const rows = CLINIC_HOURS.map((h) => overview?.loadByHour.find((p) => p.hour === h));
    return [
      { key: "scheduled", label: "Scheduled", values: rows.map((r) => r?.scheduled ?? 0), color: BRAND },
      { key: "walkIn", label: "Walk-in", values: rows.map((r) => r?.walkIn ?? 0), color: INFO },
    ];
  }, [overview]);
  const hourLabels = CLINIC_HOURS.map((h) => `${String(h).padStart(2, "0")}:00`);

  const registrationSeries: Series[] = useMemo(
    () => [
      {
        key: "registrations",
        label: "New patients",
        values: (overview?.registrations ?? []).map((p) => p.value),
        color: INFO,
      },
    ],
    [overview],
  );

  const collectedTotal = (overview?.revenue ?? []).reduce((s, p) => s + p.collected, 0);
  const billedTotal = (overview?.revenue ?? []).reduce((s, p) => s + p.billed, 0);
  const counts = overview?.today_counts;

  if (error && !overview) return <Card>{error}</Card>;

  return (
    <DashboardShell
      context={
        overview
          ? `${formatWeekday(overview.today)} · ${formatDate(overview.today)} · today's clinic`
          : "Loading today's clinic…"
      }
      title={`Hospital operations${firstName(fullName) ? `, ${firstName(fullName)}` : ""}`}
      controls={<RangeChips options={RANGES} value={days} onChange={setDays} label="Trend" />}
      actions={
        <Link href="/patients/new">
          <Button>
            <UserPlus size={16} strokeWidth={2} aria-hidden /> Register patient
          </Button>
        </Link>
      }
    >
      {/* Until the hospital is configured, the most useful thing on this screen is what
          is still missing (ADR-049). The card removes itself once setup is complete, so
          it never becomes permanent furniture. */}
      <SetupProgressCard />

      <KpiGrid>
        <StatCard
          label="In the queue now"
          value={counts ? counts.checkedIn + counts.inConsultation : null}
          icon={<ClipboardList size={16} strokeWidth={1.75} aria-hidden />}
          hint={counts ? `${counts.checkedIn} waiting · ${counts.inConsultation} in consult` : undefined}
          href="/opd"
          linkLabel="In the queue now — open the OPD queue"
        />
        <StatCard
          label="Seen today"
          value={counts ? counts.completed : null}
          icon={<Stethoscope size={16} strokeWidth={1.75} aria-hidden />}
          hint={counts ? `${counts.appointments} appointment${counts.appointments === 1 ? "" : "s"} booked today` : undefined}
        />
        <StatCard
          label="Collected"
          value={overview ? formatPaise(collectedTotal) : null}
          icon={<Wallet size={16} strokeWidth={1.75} aria-hidden />}
          hint={overview ? `of ${formatPaise(billedTotal)} billed in ${days} days` : undefined}
          href="/billing"
          linkLabel="Collected — open billing"
        />
        <StatCard
          label="Outstanding"
          value={overview ? formatPaise(overview.outstandingPaise) : null}
          icon={<AlertTriangle size={16} strokeWidth={1.75} aria-hidden />}
          hint="Across every open invoice"
          href="/billing"
          linkLabel="Outstanding balance — open billing"
        />
      </KpiGrid>

      <DashboardRow split="wide">
        <Card
          header={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Revenue</span>
              <span className="flex items-center gap-3 text-xs font-normal text-fg-subtle">
                <Legend color={BRAND} label="Billed" />
                <Legend color={SUCCESS} label="Collected" />
              </span>
            </div>
          }
        >
          <p className="mb-3 text-sm text-fg-muted">Rupees invoiced against rupees actually collected, per day.</p>
          <AreaChart
            series={revenueSeries}
            labels={revenueLabels}
            height={230}
            format={(v) => `₹${Math.round(v).toLocaleString("en-IN")}`}
            ariaLabel="Billed and collected per day"
            emptyMessage="No invoices raised in this period."
          />
        </Card>

        <Card header="Today's OPD load">
          <p className="mb-3 text-sm text-fg-muted">Check-ins by hour, split by whether the patient had a booking.</p>
          <BarChart
            series={hourSeries}
            labels={hourLabels}
            height={200}
            ariaLabel="Check-ins by hour of day"
            emptyMessage="Nobody has checked in yet today."
          />
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
            <div>
              <div className="text-xs text-fg-subtle">New patients today</div>
              <div className="text-lg font-semibold text-fg">{counts?.newPatients ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-fg-subtle">Pending lab orders</div>
              <div className="text-lg font-semibold text-fg">{overview?.pendingLabOrders ?? "—"}</div>
            </div>
          </div>
        </Card>
      </DashboardRow>

      <DashboardRow split="thirds">
        <Card header="Doctors on duty today">
          {overview && overview.providerLoad.length > 0 ? (
            <div className="flex flex-col">
              {overview.providerLoad.map((p) => (
                <PanelRow
                  key={p.providerId}
                  icon={<Stethoscope size={15} strokeWidth={1.75} aria-hidden />}
                  title={p.name}
                  meta={p.inProgress > 0 ? "In consultation now" : `${p.seen} completed`}
                  value={`${p.seen}/${p.booked}`}
                />
              ))}
            </div>
          ) : (
            <PanelEmpty>No visits assigned to a doctor yet today.</PanelEmpty>
          )}
        </Card>

        <Card
          header={
            <div className="flex items-center justify-between gap-2">
              <span>Low stock</span>
              {overview && overview.lowStock.length > 0 ? (
                <span className="text-xs font-normal text-warning">{overview.lowStock.length} at or below reorder</span>
              ) : null}
            </div>
          }
        >
          {overview && overview.lowStock.length > 0 ? (
            <div className="flex flex-col">
              {overview.lowStock.map((d) => (
                <PanelRow
                  key={d.id}
                  icon={<Package size={15} strokeWidth={1.75} aria-hidden />}
                  tone={d.onHand === 0 ? "danger" : "warning"}
                  title={d.name}
                  meta={`Reorder level ${d.reorderLevel}`}
                  value={`${d.onHand} left`}
                />
              ))}
              <Link
                href="/pharmacy/stock"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
              >
                Open stock <ArrowRight size={15} strokeWidth={2} aria-hidden />
              </Link>
            </div>
          ) : (
            <PanelEmpty>Every drug is above its reorder level.</PanelEmpty>
          )}
        </Card>

        <Card header="New patients">
          <p className="mb-3 text-sm text-fg-muted">Registrations per day.</p>
          <BarChart
            series={registrationSeries}
            labels={revenueLabels}
            height={150}
            ariaLabel="Patients registered per day"
            emptyMessage="No registrations in this period."
          />
        </Card>
      </DashboardRow>

      <DashboardRow split="wide">
        <Card header="Capacity and coverage">
          {summary ? (
            <div className="flex flex-col gap-3.5">
              <UsageBar
                label="Active branches"
                value={summary.branches.active}
                total={Math.max(summary.branches.total, 1)}
                caption={`${summary.branches.active} of ${summary.branches.total}`}
              />
              <UsageBar
                label="Practitioners on staff"
                value={summary.doctors}
                total={Math.max(summary.users, 1)}
                caption={`${summary.doctors} of ${summary.users} accounts`}
              />
              <UsageBar
                label="Modules enabled"
                value={summary.modules.length}
                total={Math.max(summary.modules.length, 1)}
                caption={`${summary.modules.length} enabled`}
              />
            </div>
          ) : (
            <PanelEmpty>Loading…</PanelEmpty>
          )}
        </Card>

        <Card header="Quick actions">
          <div className="flex flex-col gap-2">
            <QuickAction href="/patients/new" icon={<UserPlus size={15} strokeWidth={2} aria-hidden />} label="Register a patient" />
            <QuickAction href="/appointments/new" icon={<CalendarDays size={15} strokeWidth={2} aria-hidden />} label="Book an appointment" />
            <QuickAction href="/opd/check-in" icon={<ClipboardList size={15} strokeWidth={2} aria-hidden />} label="Check a patient in" />
            <QuickAction href="/users" icon={<Users size={15} strokeWidth={2} aria-hidden />} label="Manage staff accounts" />
            <QuickAction href="/reports" icon={<FlaskConical size={15} strokeWidth={2} aria-hidden />} label="Open reports" />
          </div>
        </Card>
      </DashboardRow>
    </DashboardShell>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-token border border-border bg-surface px-3 py-2.5 text-sm text-fg transition-colors hover:border-brand hover:bg-surface-2"
    >
      <span className="text-brand">{icon}</span>
      {label}
      <Plus size={14} strokeWidth={2} className="ml-auto text-fg-subtle" aria-hidden />
    </Link>
  );
}
