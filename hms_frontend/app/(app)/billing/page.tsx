"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Badge,
  DataTable,
  NumberRangeFilter,
  TableActions,
  ViewAction,
  actionsColumn,
  type Column,
  type DataTableQuery,
  type NumberRangeValue,
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
  const [query, setQuery] = useState<DataTableQuery>({ page: 1, pageSize: 20, search: "", sort: [], filters: {} });
  // Total range in rupees; converted to paise at the API boundary. It is a numeric
  // range, not a facet, so it lives beside `query` rather than in `filters` (ADR-063).
  const [amount, setAmount] = useState<NumberRangeValue>({ min: null, max: null });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const statusFilter = query.filters.status;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listInvoices({
        page: query.page,
        pageSize: query.pageSize,
        status: query.filters.status?.length ? query.filters.status.join(",") : undefined,
        amountFrom: amount.min !== null ? Math.round(amount.min * 100) : undefined,
        amountTo: amount.max !== null ? Math.round(amount.max * 100) : undefined,
      });
      setRows(res.data);
      setTotal(res.page.total);
      setError(null);
    } catch {
      setError("Could not load invoices.");
    } finally {
      setLoading(false);
    }
  }, [query, amount]);

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
      accessor: (i) => i.totalPaise,
      cell: (i) => <span className="whitespace-nowrap text-fg">{formatPaise(i.totalPaise, i.currency)}</span>,
    },
    {
      key: "balance",
      header: "Balance",
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
      filterOptions: [
        { value: "draft", label: "unpaid (draft)" },
        { value: "partially_paid", label: "partially paid" },
        { value: "paid", label: "paid" },
        { value: "void", label: "void" },
      ],
      // Raw status is the filter/sort value; the pretty form is display only.
      accessor: (i) => i.status,
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
        emptyMessage={statusFilter?.length ? "No invoices with this status." : "No invoices yet."}
        urlState
        filters={
          <NumberRangeFilter
            label="Total (₹)"
            value={amount}
            onChange={(r) => {
              setAmount(r);
              setQuery((q) => ({ ...q, page: 1 }));
            }}
          />
        }
        server={{
          total,
          page: query.page,
          pageSize: query.pageSize,
          search: query.search,
          sort: query.sort,
          filters: query.filters,
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
