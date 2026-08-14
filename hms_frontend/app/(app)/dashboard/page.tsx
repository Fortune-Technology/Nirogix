"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Badge, Card, Spinner } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { PlatformStats, OrgSummary } from "@hms/types";
import { useAuth, useCan } from "../../../lib/auth";
import { NAV_ITEMS } from "../../../lib/nav";
import * as api from "../../../lib/api";
import { PageHeader } from "../../../components/PageHeader";

function StatTile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <Card>
      <div className="text-sm text-fg-muted">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-fg">{value}</div>
      {sub && <div className="mt-1 text-xs text-fg-subtle">{sub}</div>}
    </Card>
  );
}

const NOT_YET = <span className="text-fg-subtle">— <span className="text-xs">(Stage 1)</span></span>;

function PlatformDashboard() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getPlatformStats().then(setStats).catch((e) =>
      setError(e instanceof api.ApiRequestError ? e.message : "Failed to load platform stats."),
    );
  }, []);

  if (error) return <Card>{error}</Card>;
  if (!stats) return <div className="flex items-center gap-2 text-fg-muted"><Spinner /> Loading…</div>;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Organizations" value={stats.organizations.total} sub={`${stats.organizations.active} active · ${stats.organizations.inactive} inactive`} />
        <StatTile label="Hospitals" value={stats.hospitals.total} sub={`${stats.hospitals.active} active · ${stats.hospitals.inactive} inactive`} />
        <StatTile label="Doctors" value={stats.doctors} sub="across all hospitals" />
        <StatTile label="Staff / Users" value={stats.users} sub="across all tenants" />
        <StatTile label="Branches" value={stats.branches.total} sub={`${stats.branches.active} active`} />
        <StatTile label="Patients" value={stats.patients ?? NOT_YET} />
        <StatTile label="Appointments" value={stats.appointments ?? NOT_YET} />
      </div>

      <Card header="Module adoption (tenants using each)">
        {stats.modules.length ? (
          <div className="flex flex-wrap gap-2">
            {stats.modules.map((m) => (
              <span key={m.module} className="inline-flex items-center gap-2 rounded-token bg-surface-2 px-3 py-1.5 text-sm text-fg">
                {m.name}
                <Badge tone="brand">{m.tenants}</Badge>
              </span>
            ))}
          </div>
        ) : (
          <span className="text-sm text-fg-muted">No entitlements yet.</span>
        )}
      </Card>
    </>
  );
}

function OrgDashboard() {
  const [s, setS] = useState<OrgSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getOrgSummary().then(setS).catch((e) =>
      setError(e instanceof api.ApiRequestError ? e.message : "Failed to load dashboard."),
    );
  }, []);

  if (error) return <Card>{error}</Card>;
  if (!s) return <div className="flex items-center gap-2 text-fg-muted"><Spinner /> Loading…</div>;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile label="Staff / Users" value={s.users} />
      <StatTile label="Doctors" value={s.doctors} />
      <StatTile label="Branches" value={s.branches.total} sub={`${s.branches.active} active`} />
      <StatTile label="Modules enabled" value={s.modules.length} />
      <StatTile label="Patients" value={s.patients ?? NOT_YET} />
      <StatTile label="Appointments" value={s.appointments ?? NOT_YET} />
    </div>
  );
}

export default function DashboardPage() {
  const { user, can } = useAuth();
  const isPlatform = useCan(PERMISSIONS.TENANTS_MANAGE);
  const areas = NAV_ITEMS.filter((n) => n.href !== "/dashboard" && (n.perm === null || can(n.perm)));

  return (
    <>
      <PageHeader
        title={`Welcome${user ? `, ${user.fullName}` : ""}`}
        description={isPlatform ? "Platform overview — aggregated across every tenant." : "Your organization at a glance."}
      />

      {isPlatform ? <PlatformDashboard /> : <OrgDashboard />}

      <Card header="Quick links">
        <div className="flex flex-wrap gap-2">
          {areas.map((area) => (
            <Link
              key={area.href}
              href={area.href}
              className="rounded-token border border-border bg-surface px-3 py-1.5 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              {area.label}
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}
