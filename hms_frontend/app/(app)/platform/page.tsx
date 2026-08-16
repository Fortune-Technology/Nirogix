"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Building2, ShieldAlert } from "lucide-react";
import { Badge, Card, DataTable, Spinner, type Column } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { AuditEntry, PlatformStats } from "@hms/types";
import { formatDateTime } from "@hms/utils";
import * as api from "../../../lib/api";
import { RequirePermission } from "../../../components/Can";
import { PageHeader } from "../../../components/PageHeader";
import { PLATFORM_NAV } from "../../../lib/nav";

/**
 * The System Admin dashboard (ADR-037) — the whole platform, never one hospital.
 *
 * Every number here comes from a real source. The SaaS metrics a platform
 * dashboard usually carries — revenue, MRR, ARR, subscription mix, storage,
 * uptime, support tickets — have **no data source in this schema**: there is no
 * subscription, plan or tenant-billing table (the billing module invoices
 * patients, and paid plans are deferred to the Enterprise track by ADR-020). They
 * are listed as pending below rather than rendered with invented figures.
 *
 * Cross-tenant reads stay aggregate-only (ADR-023): counts, never another
 * hospital's records.
 */
function StatTile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <Card>
      <div className="text-sm text-fg-muted">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-fg">{value}</div>
      {sub ? <div className="mt-1 text-xs text-fg-subtle">{sub}</div> : null}
    </Card>
  );
}

/** Metrics the platform cannot report yet, named honestly instead of faked. */
const PENDING_METRICS = [
  "Revenue, MRR and ARR",
  "Subscription and plan distribution",
  "Storage and infrastructure usage",
  "System health and uptime",
  "Support tickets",
];

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
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [security, setSecurity] = useState<AuditEntry[]>([]);
  const [failedLogins, setFailedLogins] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, sec, failed] = await Promise.all([
        api.getPlatformStats(),
        // Aggregate-only cross-tenant reads: the audit trail, filtered to what a
        // platform operator legitimately monitors.
        api.listAudit({ pageSize: 10, severity: "warning", sortBy: "createdAt", sortDir: "desc" }),
        api.listAudit({ pageSize: 1, search: "auth.login.failure" }),
      ]);
      setStats(s);
      setSecurity(sec.data);
      setFailedLogins(failed.page.total);
      setError(null);
    } catch {
      setError("Could not load platform metrics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !stats) {
    return (
      <div className="flex items-center gap-2 text-fg-muted">
        <Spinner /> Loading platform metrics…
      </div>
    );
  }
  if (error && !stats) return <Card>{error}</Card>;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Hospitals / organizations"
          value={stats?.organizations.total ?? "—"}
          sub={`${stats?.organizations.active ?? 0} active · ${stats?.organizations.inactive ?? 0} inactive`}
        />
        <StatTile label="Branches" value={stats?.branches.total ?? "—"} sub={`${stats?.branches.active ?? 0} active`} />
        <StatTile label="Platform users" value={stats?.users ?? "—"} sub={`${stats?.doctors ?? 0} doctors`} />
        <StatTile
          label="Failed sign-ins"
          value={failedLogins ?? "—"}
          sub="All tenants, all time"
        />
      </div>

      <Card header="Module adoption across tenants">
        {stats && stats.modules.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {stats.modules.map((m) => (
              <li key={m.module} className="flex items-center justify-between gap-4 text-sm">
                <span className="text-fg">{m.name}</span>
                <span className="text-fg-muted">
                  {m.tenants} {m.tenants === 1 ? "tenant" : "tenants"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">No modules granted yet.</p>
        )}
      </Card>

      <Card
        header={
          <span className="flex items-center gap-2">
            <ShieldAlert size={16} strokeWidth={1.75} aria-hidden /> Recent security events
          </span>
        }
      >
        <DataTable
          columns={securityColumns}
          rows={security}
          rowKey={(r) => r.id}
          loading={loading}
          onRetry={() => void load()}
          pagination={false}
          columnVisibility={false}
          searchable={false}
          emptyMessage="No warning-level events recorded."
        />
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
          These need a data source the platform does not have. They are shown as pending rather than estimated, because
          a wrong number on this screen is worse than a missing one.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {PENDING_METRICS.map((m) => (
            <li key={m} className="rounded-token border border-border bg-surface-2 px-3 py-1.5 text-sm text-fg-muted">
              {m}
            </li>
          ))}
        </ul>
      </Card>

      <Card header="Platform areas">
        <div className="flex flex-wrap gap-2">
          {PLATFORM_NAV.filter((n) => n.href !== "/platform").map((area) => (
            <Link
              key={area.href}
              href={area.href}
              className="inline-flex items-center gap-1.5 rounded-token border border-border bg-surface px-3 py-1.5 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <area.icon size={15} strokeWidth={1.75} aria-hidden />
              {area.label}
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}

export default function PlatformDashboardPage() {
  return (
    <RequirePermission perm={PERMISSIONS.TENANTS_MANAGE}>
      <PageHeader
        title="Platform overview"
        description="Every tenant on the platform. Aggregate figures only — no hospital's records are read from here."
        actions={
          <Link href="/admin/tenants" className="hms-btn hms-btn--primary hms-btn--sm">
            <Building2 size={16} strokeWidth={2} aria-hidden /> Manage tenants
          </Link>
        }
      />
      <PlatformOverview />
    </RequirePermission>
  );
}
