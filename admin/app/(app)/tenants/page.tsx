"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import {
  Badge,
  Button,
  DataTable,
  TableActions,
  ToggleAction,
  ViewAction,
  actionsColumn,
  type Column,
} from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { Tenant } from "@hms/types";
import { formatDate } from "@hms/utils";
import * as api from "../../../lib/api";
import { RequirePermission } from "../../../components/Can";
import { PageHeader } from "../../../components/PageHeader";

function statusTone(s: string): "success" | "warning" | "danger" | "neutral" {
  if (s === "active") return "success";
  if (s === "suspended") return "warning";
  if (s === "cancelled" || s === "deactivated") return "danger";
  return "neutral";
}

function tenantColumns(busy: boolean, onSetStatus: (t: Tenant, status: string) => void): Array<Column<Tenant>> {
  return [
  {
    key: "code",
    header: "Code",
    hideable: false,
    accessor: (t) => t.code,
    cell: (t) => (
      <Link href={`/tenants/${t.id}`} className="font-medium text-brand hover:underline">
        {t.code}
      </Link>
    ),
  },
  { key: "name", header: "Name", accessor: (t) => t.name, cell: (t) => <span className="text-fg">{t.name}</span> },
  {
    key: "status",
    header: "Status",
    filterable: true,
    accessor: (t) => t.status,
    cell: (t) => <Badge tone={statusTone(t.status)}>{t.status}</Badge>,
  },
  {
    key: "created",
    header: "Created",
    accessor: (t) => t.createdAt,
    cell: (t) => <span className="text-fg-muted">{formatDate(t.createdAt)}</span>,
  },
  actionsColumn<Tenant>((t) => (
    <TableActions label={`Actions for ${t.name}`}>
      <ViewAction label="View tenant" href={`/tenants/${t.id}`} />
      <ToggleAction
        on={t.status === "active"}
        onLabel="Suspend tenant"
        offLabel="Reactivate tenant"
        // Only the active ↔ suspended transition belongs on a list row; cancelled
        // and deactivated tenants are handled on the tenant's own page.
        permitted={t.status === "active" || t.status === "suspended"}
        loading={busy}
        confirm={
          t.status === "active"
            ? {
                title: `Suspend ${t.name}?`,
                description: "Everyone in this organization is signed out and cannot sign in until it is reactivated.",
                confirmLabel: "Suspend",
              }
            : undefined
        }
        onToggle={(next) => onSetStatus(t, next ? "active" : "suspended")}
      />
    </TableActions>
  )),
  ];
}

function TenantsTable() {
  const [rows, setRows] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api.listTenants());
      setError(null);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Failed to load tenants.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(t: Tenant, status: string) {
    setBusy(true);
    try {
      await api.setTenantStatus(t.id, status);
      await load();
    } catch {
      // The shared API-feedback layer has already told the user.
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Tenants"
        description="Every hospital / organization on the platform."
        actions={
          <Link href="/tenants/new">
            <Button><Plus size={16} strokeWidth={2} /> Onboard tenant</Button>
          </Link>
        }
      />
      <DataTable
        columns={tenantColumns(busy, (t, status) => void setStatus(t, status))}
        rows={rows}
        rowKey={(t) => t.id}
        loading={loading}
        error={error}
        onRetry={() => void load()}
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
