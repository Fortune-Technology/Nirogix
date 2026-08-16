"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Badge,
  DataTable,
  TableActions,
  ViewAction,
  actionsColumn,
  type Column,
  type DataTableQuery,
} from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { InvoiceListItem } from "@hms/types";
import { formatDate } from "@hms/utils";
import * as api from "../../../lib/api";
import { RequirePermission } from "../../../components/Can";
import { PageHeader } from "../../../components/PageHeader";
import { formatPaise } from "../../../lib/money";

function statusTone(s: string): "success" | "warning" | "neutral" | "danger" {
  if (s === "paid") return "success";
  if (s === "partially_paid") return "warning";
  if (s === "void") return "neutral";
  return "danger"; // draft = unpaid
}

function InvoicesTable() {
  // Server mode: the invoice list is paginated and filtered by the API, so the
  // table reports the view the user asked for instead of paging in the browser.
  const [rows, setRows] = useState<InvoiceListItem[]>([]);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState<DataTableQuery>({ page: 1, pageSize: 20, search: "", sort: [] });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listInvoices({
        page: query.page,
        pageSize: query.pageSize,
        status: status || undefined,
      });
      setRows(res.data);
      setTotal(res.page.total);
      setError(null);
    } catch {
      setError("Could not load invoices.");
    } finally {
      setLoading(false);
    }
  }, [query, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Array<Column<InvoiceListItem>> = [
    {
      key: "number",
      header: "Invoice",
      hideable: false,
      accessor: (i) => i.invoiceNumber,
      cell: (i) => (
        <Link href={`/billing/${i.id}`} className="font-mono text-brand hover:underline">
          {i.invoiceNumber}
        </Link>
      ),
    },
    {
      key: "patient",
      header: "Patient",
      hideable: false,
      accessor: (i) => `${i.patientName} ${i.patientUhid}`,
      cell: (i) => (
        <Link href={`/patients/${i.patientId}`} className="hover:underline">
          {i.patientName} <span className="font-mono text-xs text-fg-muted">{i.patientUhid}</span>
        </Link>
      ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      accessor: (i) => i.totalPaise,
      cell: (i) => <span className="whitespace-nowrap text-fg">{formatPaise(i.totalPaise, i.currency)}</span>,
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      accessor: (i) => i.balancePaise,
      cell: (i) => (
        <span className={`whitespace-nowrap ${i.balancePaise > 0 ? "text-fg" : "text-fg-muted"}`}>
          {formatPaise(i.balancePaise, i.currency)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      filterable: true,
      accessor: (i) => i.status.replace("_", " "),
      cell: (i) => <Badge tone={statusTone(i.status)}>{i.status.replace("_", " ")}</Badge>,
    },
    {
      key: "date",
      header: "Created",
      accessor: (i) => i.createdAt,
      cell: (i) => <span className="whitespace-nowrap text-fg-muted">{formatDate(i.createdAt)}</span>,
    },
    actionsColumn<InvoiceListItem>((i) => (
      <TableActions label={`Actions for invoice ${i.invoiceNumber}`}>
        <ViewAction label="View invoice" href={`/billing/${i.id}`} />
      </TableActions>
    )),
  ];

  return (
    <>
      <PageHeader title="Billing" description={`${total} invoice${total === 1 ? "" : "s"}`} />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(i) => i.id}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        emptyMessage={status ? "No invoices with this status." : "No invoices yet."}
        urlState
        filters={
          <label className="inline-flex items-center gap-2 text-sm text-fg-muted">
            <span className="sr-only">Invoice status</span>
            <select
              className="hms-input hms-input--sm"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setQuery((q) => ({ ...q, page: 1 }));
              }}
            >
              <option value="">All statuses</option>
              <option value="draft">Unpaid (draft)</option>
              <option value="partially_paid">Partially paid</option>
              <option value="paid">Paid</option>
              <option value="void">Void</option>
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

export default function BillingPage() {
  return (
    <RequirePermission perm={PERMISSIONS.BILLING_VIEW}>
      <InvoicesTable />
    </RequirePermission>
  );
}
