"use client";

import { useEffect, useState } from "react";
import { Badge, Button, DataTable, type Column } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { AuditEntry } from "@hms/types";
import * as api from "../../../lib/api";
import { RequirePermission } from "../../../components/Can";
import { PageHeader } from "../../../components/PageHeader";

function statusTone(code: number | null): "success" | "warning" | "danger" | "neutral" {
  if (code === null) return "neutral";
  if (code >= 500) return "danger";
  if (code >= 400) return "warning";
  return "success";
}

const columns: Array<Column<AuditEntry>> = [
  {
    key: "when",
    header: "When",
    cell: (r) => <span className="whitespace-nowrap text-fg-muted">{new Date(r.createdAt).toLocaleString()}</span>,
  },
  { key: "action", header: "Action", cell: (r) => <span className="font-medium text-fg">{r.action}</span> },
  { key: "resource", header: "Resource", cell: (r) => r.resourceType ?? "—" },
  {
    key: "method",
    header: "Request",
    cell: (r) => (r.method ? <span className="text-fg-muted">{r.method} {r.path}</span> : "—"),
  },
  {
    key: "status",
    header: "Status",
    cell: (r) => (r.statusCode === null ? "—" : <Badge tone={statusTone(r.statusCode)}>{r.statusCode}</Badge>),
  },
];

function AuditTable() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .listAudit(page, 20)
      .then((res) => {
        if (!alive) return;
        setRows(res.data);
        setTotalPages(res.page.totalPages);
        setError(null);
      })
      .catch((err) => alive && setError(err instanceof api.ApiRequestError ? err.message : "Failed to load audit log."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [page]);

  return (
    <>
      <PageHeader title="Audit Log" description="Immutable, append-only record of security-relevant events." />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        error={error}
        emptyMessage="No audit entries."
      />
      <div className="flex items-center justify-end gap-3">
        <span className="text-sm text-fg-muted">
          Page {page} of {totalPages}
        </span>
        <Button variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </>
  );
}

export default function AuditPage() {
  return (
    <RequirePermission perm={PERMISSIONS.AUDIT_VIEW}>
      <AuditTable />
    </RequirePermission>
  );
}
