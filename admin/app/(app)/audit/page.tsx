"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, DataTable, type Column, type DataTableQuery } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { AuditEntry } from "@hms/types";
import { formatDateTime } from "@hms/utils";
import * as api from "../../../lib/api";
import { RequirePermission } from "../../../components/Can";
import { PageHeader } from "../../../components/PageHeader";

function statusTone(code: number | null): "success" | "warning" | "danger" | "neutral" {
  if (code === null) return "neutral";
  if (code >= 500) return "danger";
  if (code >= 400) return "warning";
  return "success";
}

/**
 * The audit trail can grow without bound, so this table runs in **server mode**:
 * paging, search, and sorting are all done by `GET /audit` (allow-listed sort
 * columns) — the browser never holds more than one page.
 */
const columns: Array<Column<AuditEntry>> = [
  {
    key: "createdAt",
    header: "When",
    hideable: false,
    accessor: (r) => r.createdAt,
    cell: (r) => <span className="whitespace-nowrap text-fg-muted">{formatDateTime(r.createdAt)}</span>,
  },
  {
    key: "action",
    header: "Action",
    accessor: (r) => r.action,
    cell: (r) => <span className="font-medium text-fg">{r.action}</span>,
  },
  { key: "resource", header: "Resource", accessor: (r) => r.resourceType, cell: (r) => r.resourceType ?? "—" },
  {
    key: "method",
    header: "Request",
    sortable: false,
    accessor: (r) => (r.method ? `${r.method} ${r.path ?? ""}` : ""),
    cell: (r) =>
      r.method ? (
        <span className="text-fg-muted">
          {r.method} {r.path}
        </span>
      ) : (
        "—"
      ),
  },
  {
    key: "severity",
    header: "Severity",
    defaultHidden: true,
    accessor: (r) => r.severity,
    cell: (r) => <span className="text-fg-muted">{r.severity}</span>,
  },
  {
    key: "statusCode",
    header: "Status",
    align: "right",
    accessor: (r) => r.statusCode,
    cell: (r) => (r.statusCode === null ? "—" : <Badge tone={statusTone(r.statusCode)}>{r.statusCode}</Badge>),
  },
];

const SEVERITIES = ["info", "notice", "warning", "critical"] as const;

function AuditTable() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [query, setQuery] = useState<DataTableQuery>({ page: 1, pageSize: 20, search: "", sort: [] });
  const [severity, setSeverity] = useState("");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (q: DataTableQuery, sev: string) => {
      setLoading(true);
      try {
        const res = await api.listAudit({
          page: q.page,
          pageSize: q.pageSize,
          search: q.search || undefined,
          severity: sev || undefined,
          sortBy: q.sort[0]?.key,
          sortDir: q.sort[0]?.dir,
        });
        setRows(res.data);
        setTotal(res.page.total);
        setError(null);
      } catch {
        setError("Could not load the audit log.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(query, severity);
  }, [query, severity, load]);

  return (
    <>
      <PageHeader title="Audit Log" description="Immutable, append-only record of security-relevant events." />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        error={error}
        onRetry={() => void load(query, severity)}
        searchPlaceholder="Search action, path, or resource…"
        emptyMessage={query.search || severity ? "No entries match this filter." : "No audit entries."}
        urlState
        filters={
          <label className="inline-flex items-center gap-2 text-sm text-fg-muted">
            <span className="sr-only">Severity</span>
            <select
              className="hms-input hms-input--sm"
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value);
                setQuery((q) => ({ ...q, page: 1 }));
              }}
            >
              <option value="">All severities</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        }
        server={{
          total,
          page: query.page,
          pageSize: query.pageSize,
          search: query.search,
          sort: query.sort,
          onChange: setQuery,
        }}
      />
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
