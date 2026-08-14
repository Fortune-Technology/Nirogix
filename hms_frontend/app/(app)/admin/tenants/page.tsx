"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge, Button, DataTable, type Column } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { Tenant } from "@hms/types";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";
import { PageHeader } from "../../../../components/PageHeader";

function statusTone(s: string): "success" | "warning" | "danger" | "neutral" {
  if (s === "active") return "success";
  if (s === "suspended") return "warning";
  if (s === "cancelled" || s === "deactivated") return "danger";
  return "neutral";
}

const columns: Array<Column<Tenant>> = [
  {
    key: "code",
    header: "Code",
    cell: (t) => (
      <Link href={`/admin/tenants/${t.id}`} className="font-medium text-brand hover:underline">
        {t.code}
      </Link>
    ),
  },
  { key: "name", header: "Name", cell: (t) => <span className="text-fg">{t.name}</span> },
  { key: "status", header: "Status", cell: (t) => <Badge tone={statusTone(t.status)}>{t.status}</Badge> },
  {
    key: "created",
    header: "Created",
    cell: (t) => <span className="text-fg-muted">{new Date(t.createdAt).toLocaleDateString()}</span>,
  },
];

function TenantsTable() {
  const [rows, setRows] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .listTenants()
      .then((d) => alive && setRows(d))
      .catch((e) => alive && setError(e instanceof api.ApiRequestError ? e.message : "Failed to load tenants."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <PageHeader
        title="Tenants"
        description="Every hospital / organization on the platform."
        actions={
          <Link href="/admin/tenants/new">
            <Button><Plus size={16} strokeWidth={2} /> Onboard tenant</Button>
          </Link>
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(t) => t.id}
        loading={loading}
        error={error}
        emptyMessage="No tenants yet."
      />
    </>
  );
}

export default function TenantsPage() {
  return (
    <RequirePermission perm={PERMISSIONS.TENANTS_MANAGE}>
      <TenantsTable />
    </RequirePermission>
  );
}
