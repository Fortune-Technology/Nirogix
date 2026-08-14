"use client";

import Link from "next/link";
import { Badge, Card } from "@hms/ui";
import { useAuth } from "../../../lib/auth";
import { NAV_ITEMS } from "../../../lib/nav";
import { PageHeader } from "../../../components/PageHeader";

export default function DashboardPage() {
  const { user, can } = useAuth();
  const areas = NAV_ITEMS.filter((n) => n.href !== "/dashboard" && (n.perm === null || can(n.perm)));

  return (
    <>
      <PageHeader
        title={`Welcome${user ? `, ${user.fullName}` : ""}`}
        description="Your workspace. Cards below reflect only what your role can access."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((area) => (
          <Link key={area.href} href={area.href}>
            <Card className="h-full transition-shadow hover:shadow-[var(--hms-shadow-md)]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-fg">{area.label}</span>
                <Badge tone="brand">Open</Badge>
              </div>
              <p className="mt-1 text-sm text-fg-muted">Go to {area.label.toLowerCase()}.</p>
            </Card>
          </Link>
        ))}
      </div>

      {user && (
        <Card header="Session">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-fg-muted">Signed in as</dt>
              <dd className="text-fg">{user.email}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Multi-factor auth</dt>
              <dd>
                {user.mfaEnabled ? (
                  <Badge tone="success">Enabled</Badge>
                ) : (
                  <Badge tone="warning">Not enabled</Badge>
                )}
              </dd>
            </div>
          </dl>
        </Card>
      )}
    </>
  );
}
