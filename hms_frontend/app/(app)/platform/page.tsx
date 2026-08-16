"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Database,
  Layers,
  Plus,
  ScrollText,
  ShieldAlert,
  Stethoscope,
  UserPlus,
  Users,
} from "lucide-react";
import {
  AreaChart,
  Badge,
  BarChart,
  Card,
  DataTable,
  StatCard,
  UsageBar,
  type Column,
  type Series,
} from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { AuditEntry, PlatformStats, PlatformTrends } from "@hms/types";
import { formatDateTime, formatDayLabel, formatMonthLabel } from "@hms/utils";
import * as api from "../../../lib/api";
import { RequirePermission } from "../../../components/Can";
import { PageHeader } from "../../../components/PageHeader";

/**
 * The System Admin dashboard (ADR-037, ADR-043) — the whole platform, never one
 * hospital.
 *
 * **Every tile is backed by a real query.** Growth comes from each record's own
 * `created_at` (`GET /admin/trends`), adoption from live entitlements, security
 * from the audit trail, health from the API's own liveness and readiness probes.
 * The SaaS metrics this kind of screen usually carries — revenue, MRR, ARR, plan
 * mix, storage, uptime percentages, support tickets — have **no data source in
 * this schema** (there is no subscription or tenant-billing table; the billing
 * module invoices patients, and paid plans are deferred to the Enterprise track by
 * ADR-020). They are named as pending rather than drawn with invented numbers.
 *
 * Cross-tenant reads stay aggregate-only (ADR-023): counts, never another
 * hospital's records.
 */

/** Ranges the operator can ask for. Kept small — each one is a real query. */
const RANGES = [
  { months: 6, label: "6 months" },
  { months: 12, label: "12 months" },
  { months: 24, label: "24 months" },
] as const;

/** Metrics the platform cannot report yet, named honestly instead of estimated. */
const PENDING_METRICS = [
  "Revenue, MRR and ARR",
  "Subscription and plan distribution",
  "Storage and infrastructure usage",
  "Uptime percentage over time",
  "Support tickets",
];

const BRAND = "var(--hms-brand)";
const INFO = "var(--hms-info)";
const WARNING = "var(--hms-warning)";
const DANGER = "var(--hms-danger)";

const securityColumns: Array<Column<AuditEntry>> = [
  {
    key: "createdAt",
    header: "When",
    hideable: false,
    accessor: (r) => r.createdAt,
    cell: (r) => <span className="whitespace-nowrap text-fg-muted">{formatDateTime(r.createdAt)}</span>,
  },
  { key: "action", header: "Event", accessor: (r) => r.action, cell: (r) => <span className="text-fg">{r.action}</span> },
  {
    key: "severity",
    header: "Severity",
    filterable: true,
    accessor: (r) => r.severity,
    cell: (r) => (
      <Badge tone={r.severity === "critical" ? "danger" : r.severity === "warning" ? "warning" : "neutral"}>
        {r.severity}
      </Badge>
    ),
  },
  { key: "path", header: "Request", sortable: false, accessor: (r) => r.path ?? "", cell: (r) => r.path ?? "—" },
];

function PlatformOverview() {
  const [months, setMonths] = useState<number>(12);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [trends, setTrends] = useState<PlatformTrends | null>(null);
  const [security, setSecurity] = useState<AuditEntry[]>([]);
  const [failedLogins, setFailedLogins] = useState<number | null>(null);
  const [health, setHealth] = useState<{ api: boolean; db: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (range: number) => {
    setLoading(true);
    try {
      const [s, t, sec, failed, h] = await Promise.all([
        api.getPlatformStats(),
        api.getPlatformTrends(range),
        api.listAudit({ pageSize: 8, severity: "warning", sortBy: "createdAt", sortDir: "desc" }),
        api.listAudit({ pageSize: 1, search: "auth.login.failure" }),
        api.getSystemHealth(),
      ]);
      setStats(s);
      setTrends(t);
      setSecurity(sec.data);
      setFailedLogins(failed.page.total);
      setHealth(h);
      setError(null);
    } catch {
      setError("Could not load platform metrics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(months);
  }, [load, months]);

  const monthLabels = useMemo(() => (trends?.hospitals ?? []).map((p) => formatMonthLabel(p.period)), [trends]);
  const dayLabels = useMemo(() => (trends?.events ?? []).map((p) => formatDayLabel(p.period)), [trends]);

  /** Growth of the customer base and the people in it — the platform's core story. */
  const growthSeries: Series[] = useMemo(
    () => [
      { key: "hospitals", label: "Hospitals", values: (trends?.hospitals ?? []).map((p) => p.cumulative), color: BRAND },
      { key: "users", label: "Staff accounts", values: (trends?.users ?? []).map((p) => p.cumulative), color: INFO },
    ],
    [trends],
  );

  const onboardingSeries: Series[] = useMemo(
    () => [{ key: "new", label: "New hospitals", values: (trends?.hospitals ?? []).map((p) => p.created), color: BRAND }],
    [trends],
  );

  const eventSeries: Series[] = useMemo(
    () => [
      { key: "info", label: "Routine", values: (trends?.events ?? []).map((p) => p.info), color: INFO },
      { key: "warning", label: "Warning", values: (trends?.events ?? []).map((p) => p.warning), color: WARNING },
      { key: "critical", label: "Critical", values: (trends?.events ?? []).map((p) => p.critical), color: DANGER },
    ],
    [trends],
  );

  /** This month's additions, straight off the last point of the real series. */
  const last = <T extends { created: number }>(series: T[] | undefined): number | null =>
    series && series.length > 0 ? (series[series.length - 1]?.created ?? 0) : null;

  const newHospitals = last(trends?.hospitals);
  const newUsers = last(trends?.users);
  const warningEvents = (trends?.events ?? []).reduce((sum, p) => sum + p.warning + p.critical, 0);
  const clinicalActive = (stats?.modules ?? []).length;

  if (error && !stats) return <Card>{error}</Card>;

  return (
    <>
      {/* Range filter — applies to every time series on the screen at once. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-fg-muted">Showing</span>
          <div className="inline-flex rounded-token border border-border bg-surface p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.months}
                type="button"
                onClick={() => setMonths(r.months)}
                aria-pressed={months === r.months}
                className={
                  "rounded-token px-3 py-1.5 text-sm font-medium transition-colors " +
                  (months === r.months ? "bg-brand-subtle text-brand" : "text-fg-muted hover:text-fg")
                }
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {trends ? (
          <span className="text-xs text-fg-subtle">
            {formatMonthLabel(trends.from)} — {formatMonthLabel(trends.to)}
          </span>
        ) : null}
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Hospitals"
          value={loading && !stats ? null : (stats?.hospitals.total ?? 0)}
          icon={<Building2 size={16} strokeWidth={1.75} aria-hidden />}
          hint={`${stats?.hospitals.active ?? 0} active · ${stats?.hospitals.inactive ?? 0} inactive`}
          delta={newHospitals === null ? null : { value: newHospitals, label: "this month" }}
          spark={{ values: (trends?.hospitals ?? []).map((p) => p.cumulative), color: BRAND }}
        />
        <StatCard
          label="Staff accounts"
          value={loading && !stats ? null : (stats?.users ?? 0)}
          icon={<Users size={16} strokeWidth={1.75} aria-hidden />}
          hint={`${stats?.doctors ?? 0} practitioners`}
          delta={newUsers === null ? null : { value: newUsers, label: "this month" }}
          spark={{ values: (trends?.users ?? []).map((p) => p.cumulative), color: INFO }}
        />
        <StatCard
          label="Branches"
          value={loading && !stats ? null : (stats?.branches.total ?? 0)}
          icon={<Layers size={16} strokeWidth={1.75} aria-hidden />}
          hint={`${stats?.branches.active ?? 0} active`}
        />
        <StatCard
          label="Failed sign-ins"
          value={loading && failedLogins === null ? null : (failedLogins ?? 0)}
          icon={<ShieldAlert size={16} strokeWidth={1.75} aria-hidden />}
          hint="All tenants, all time"
          invertDelta
        />
      </div>

      {/* Growth + onboarding */}
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card
          header={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Platform growth</span>
              <span className="flex items-center gap-3 text-xs font-normal text-fg-subtle">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: BRAND }} aria-hidden />
                  Hospitals
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: INFO }} aria-hidden />
                  Staff accounts
                </span>
              </span>
            </div>
          }
        >
          <p className="mb-3 text-sm text-fg-muted">
            Cumulative totals from each record&apos;s registration date. Hover for a month.
          </p>
          <AreaChart
            series={growthSeries}
            labels={monthLabels}
            height={240}
            ariaLabel="Cumulative hospitals and staff accounts by month"
            emptyMessage="No hospitals onboarded yet."
          />
        </Card>

        <Card header="Onboarding">
          <p className="mb-3 text-sm text-fg-muted">Hospitals provisioned per month.</p>
          <BarChart
            series={onboardingSeries}
            labels={monthLabels}
            height={200}
            ariaLabel="New hospitals per month"
            emptyMessage="No hospitals onboarded yet."
          />
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
            <div>
              <div className="text-xs text-fg-subtle">Added this month</div>
              <div className="text-lg font-semibold text-fg">{newHospitals ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-fg-subtle">Suspended or cancelled</div>
              <div className="text-lg font-semibold text-fg">{stats?.hospitals.inactive ?? "—"}</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Adoption + health */}
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card
          header={
            <div className="flex items-center justify-between gap-2">
              <span>Module adoption</span>
              <span className="text-xs font-normal text-fg-subtle">
                {clinicalActive} of {stats?.modules.length ?? 0} entitled somewhere
              </span>
            </div>
          }
        >
          {stats && stats.modules.length > 0 ? (
            <div className="flex flex-col gap-3.5">
              {stats.modules.map((m) => (
                <UsageBar
                  key={m.module}
                  label={m.name}
                  value={m.tenants}
                  total={Math.max(stats.hospitals.total, 1)}
                  caption={`${m.tenants} of ${stats.hospitals.total} hospital${stats.hospitals.total === 1 ? "" : "s"}`}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-fg-muted">No modules granted yet.</p>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card
            header={
              <span className="flex items-center gap-2">
                <Activity size={16} strokeWidth={1.75} aria-hidden /> System health
              </span>
            }
          >
            <div className="flex flex-col gap-2.5">
              <HealthRow label="API" ok={health?.api ?? null} detail="Liveness probe" />
              <HealthRow label="Database" ok={health?.db ?? null} detail="Readiness probe" icon={<Database size={15} strokeWidth={1.75} aria-hidden />} />
            </div>
            <p className="mt-3 text-xs text-fg-subtle">
              Live probes, checked when this page loads. Uptime history needs a monitor the platform does not run yet.
            </p>
          </Card>

          <Card header="Quick actions">
            <div className="flex flex-col gap-2">
              <QuickAction href="/admin/tenants/new" icon={<Plus size={15} strokeWidth={2} aria-hidden />} label="Onboard a hospital" meta="Create the tenant, grant modules, add its first admin" />
              <QuickAction href="/admin/tenants" icon={<Building2 size={15} strokeWidth={2} aria-hidden />} label="Manage hospitals" meta="Status, entitlements, support sessions" />
              <QuickAction href="/admin/branding" icon={<Stethoscope size={15} strokeWidth={2} aria-hidden />} label="Platform branding" meta="Marketing and Portal defaults" />
              <QuickAction href="/audit" icon={<ScrollText size={15} strokeWidth={2} aria-hidden />} label="Audit trail" meta="Every security-relevant action, all tenants" />
            </div>
          </Card>
        </div>
      </div>

      {/* Security */}
      <Card
        header={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <ShieldAlert size={16} strokeWidth={1.75} aria-hidden /> Security activity
            </span>
            <span className="text-xs font-normal text-fg-subtle">
              {warningEvents} warning or critical event{warningEvents === 1 ? "" : "s"} in 30 days
            </span>
          </div>
        }
      >
        <BarChart
          series={eventSeries}
          labels={dayLabels}
          height={140}
          ariaLabel="Audit events per day by severity, last 30 days"
          emptyMessage="No audit events recorded in the last 30 days."
        />

        <div className="mt-5">
          <DataTable
            columns={securityColumns}
            rows={security}
            rowKey={(r) => r.id}
            loading={loading}
            onRetry={() => void load(months)}
            pagination={false}
            columnVisibility={false}
            searchable={false}
            emptyMessage="No warning-level events recorded."
          />
        </div>
        <Link
          href="/audit"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
        >
          Open the full audit trail <ArrowRight size={15} strokeWidth={2} aria-hidden />
        </Link>
      </Card>

      <Card
        header={
          <span className="flex items-center gap-2">
            <AlertTriangle size={16} strokeWidth={1.75} aria-hidden /> Not reported yet
          </span>
        }
      >
        <p className="text-sm text-fg-muted">
          These need a data source the platform does not have. They are shown as pending rather than estimated, because a
          wrong number on this screen is worse than a missing one.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {PENDING_METRICS.map((m) => (
            <li key={m} className="rounded-token border border-border bg-surface-2 px-3 py-1.5 text-sm text-fg-muted">
              {m}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function HealthRow({
  label,
  ok,
  detail,
  icon,
}: {
  label: string;
  ok: boolean | null;
  detail: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-sm text-fg">
        {icon ?? <Activity size={15} strokeWidth={1.75} aria-hidden />}
        {label}
        <span className="text-xs text-fg-subtle">{detail}</span>
      </span>
      {ok === null ? (
        <span className="hms-skeleton h-5 w-16 rounded-token" aria-hidden />
      ) : ok ? (
        <Badge tone="success">
          <CheckCircle2 size={13} strokeWidth={2} aria-hidden /> Operational
        </Badge>
      ) : (
        <Badge tone="danger">Unreachable</Badge>
      )}
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
  meta,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  meta: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-token border border-border bg-surface px-3 py-2.5 transition-colors hover:border-brand hover:bg-surface-2"
    >
      <span className="mt-0.5 text-brand">{icon}</span>
      <span className="flex flex-col">
        <span className="text-sm font-medium text-fg">{label}</span>
        <span className="text-xs text-fg-subtle">{meta}</span>
      </span>
    </Link>
  );
}

export default function PlatformDashboardPage() {
  return (
    <RequirePermission perm={PERMISSIONS.TENANTS_MANAGE}>
      <PageHeader
        title="Platform overview"
        description="Every hospital on the platform. Aggregate figures only — no hospital's records are read from here."
        actions={
          <Link href="/admin/tenants/new" className="hms-btn hms-btn--primary hms-btn--sm">
            <UserPlus size={16} strokeWidth={2} aria-hidden /> Onboard hospital
          </Link>
        }
      />
      <PlatformOverview />
    </RequirePermission>
  );
}
