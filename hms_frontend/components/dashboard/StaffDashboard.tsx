"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ClipboardList, Receipt, Users, Wallet } from "lucide-react";
import { Card, StatCard } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { DashboardOverview, OrgSummary } from "@hms/types";
import { useAuth, useCan } from "../../lib/auth";
import * as api from "../../lib/api";
import { formatPaise } from "../../lib/money";
import { DashboardRow, DashboardShell, KpiGrid, PanelEmpty, firstName } from "./DashboardShell";
import { TENANT_NAV_GROUPS } from "../../lib/nav";

/**
 * The fallback dashboard (ADR-044) — a cashier, a records clerk, an auditor: staff
 * whose day is not the clinical queue. Same shell and KPI rhythm as every other
 * role, showing only what this user's permissions actually reach, so it degrades
 * to something honest rather than to an empty screen.
 */
export function StaffDashboard({ fullName }: { fullName?: string }) {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [summary, setSummary] = useState<OrgSummary | null>(null);
  const { can } = useAuth();
  const canBilling = useCan(PERMISSIONS.BILLING_VIEW);
  const canPatients = useCan(PERMISSIONS.PATIENT_VIEW);

  useEffect(() => {
    void api.getDashboardOverview(7).then(setOverview).catch(() => setOverview(null));
    void api.getOrgSummary().then(setSummary).catch(() => setSummary(null));
  }, []);

  const counts = overview?.today_counts;
  const collected = (overview?.revenue ?? []).reduce((s, p) => s + p.collected, 0);

  // Permission-filtered, like the sidebar. Listing a route the user will only be
  // 403'd on is worse than listing nothing (rules.md → UI / UX Rules).
  const links = TENANT_NAV_GROUPS.flatMap((g) => g.items).filter(
    (n) => n.href !== "/dashboard" && (n.perm === null || can(n.perm)),
  );

  return (
    <DashboardShell context="Your organization today" title={`Welcome${firstName(fullName) ? `, ${firstName(fullName)}` : ""}`}>
      <KpiGrid>
        {canPatients && (
          <StatCard
            label="Registered today"
            value={counts?.newPatients ?? null}
            icon={<Users size={16} strokeWidth={1.75} aria-hidden />}
          />
        )}
        <StatCard
          label="Seen today"
          value={counts?.completed ?? null}
          icon={<ClipboardList size={16} strokeWidth={1.75} aria-hidden />}
          hint={counts ? `${counts.appointments} booked` : undefined}
        />
        {canBilling && (
          <>
            <StatCard
              label="Collected (7 days)"
              value={overview ? formatPaise(collected) : null}
              icon={<Wallet size={16} strokeWidth={1.75} aria-hidden />}
            />
            <StatCard
              label="Outstanding"
              value={overview ? formatPaise(overview.outstandingPaise) : null}
              icon={<Receipt size={16} strokeWidth={1.75} aria-hidden />}
              hint="Across every open invoice"
            />
          </>
        )}
        {!canBilling && (
          <StatCard
            label="Modules enabled"
            value={summary?.modules.length ?? null}
            icon={<CalendarDays size={16} strokeWidth={1.75} aria-hidden />}
          />
        )}
      </KpiGrid>

      <DashboardRow split="even">
        <Card header="Where you work">
          {links.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {links.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="inline-flex items-center gap-1.5 rounded-token border border-border bg-surface px-3 py-1.5 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  <item.icon size={15} strokeWidth={1.75} aria-hidden />
                  {item.label}
                </Link>
              ))}
            </div>
          ) : (
            <PanelEmpty>No modules are open to your account yet.</PanelEmpty>
          )}
        </Card>

        <Card header="Your organization">
          {summary ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Row label="Staff accounts" value={summary.users} />
              <Row label="Practitioners" value={summary.doctors} />
              <Row label="Branches" value={`${summary.branches.active} of ${summary.branches.total} active`} />
              <Row label="Modules" value={summary.modules.length} />
            </dl>
          ) : (
            <PanelEmpty>Loading…</PanelEmpty>
          )}
        </Card>
      </DashboardRow>
    </DashboardShell>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-right font-medium text-fg">{value}</dd>
    </>
  );
}
