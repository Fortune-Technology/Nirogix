"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, DataTable, type Column } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { InvoiceListItem } from "@hms/types";
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
  const [rows, setRows] = useState<InvoiceListItem[]>([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listInvoices({ page, pageSize: 20, status: status || undefined });
      setRows(res.data);
      setTotalPages(res.page.totalPages);
      setTotal(res.page.total);
      setError(null);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Array<Column<InvoiceListItem>> = [
    {
      key: "number",
      header: "Invoice",
      cell: (i) => (
        <Link href={`/billing/${i.id}`} className="font-mono text-brand hover:underline">
          {i.invoiceNumber}
        </Link>
      ),
    },
    {
      key: "patient",
      header: "Patient",
      cell: (i) => (
        <Link href={`/patients/${i.patientId}`} className="hover:underline">
          {i.patientName} <span className="font-mono text-xs text-fg-muted">{i.patientUhid}</span>
        </Link>
      ),
    },
    { key: "total", header: "Total", cell: (i) => <span className="whitespace-nowrap text-fg">{formatPaise(i.totalPaise, i.currency)}</span> },
    {
      key: "balance",
      header: "Balance",
      cell: (i) => (
        <span className={`whitespace-nowrap ${i.balancePaise > 0 ? "text-fg" : "text-fg-muted"}`}>
          {formatPaise(i.balancePaise, i.currency)}
        </span>
      ),
    },
    { key: "status", header: "Status", cell: (i) => <Badge tone={statusTone(i.status)}>{i.status.replace("_", " ")}</Badge> },
    {
      key: "date",
      header: "Created",
      cell: (i) => <span className="whitespace-nowrap text-fg-muted">{new Date(i.createdAt).toLocaleDateString()}</span>,
    },
  ];

  return (
    <>
      <PageHeader title="Billing" description={`${total} invoice${total === 1 ? "" : "s"}`} />
      <div className="flex items-center gap-2">
        <span className="text-sm text-fg-muted">Status:</span>
        <select className="hms-input max-w-[14rem]" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          <option value="">All</option>
          <option value="draft">Unpaid (draft)</option>
          <option value="partially_paid">Partially paid</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </select>
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(i) => i.id} loading={loading} error={error} emptyMessage="No invoices yet." />
      <div className="flex items-center justify-end gap-3">
        <span className="text-sm text-fg-muted">Page {page} of {totalPages}</span>
        <Button variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</Button>
        <Button variant="secondary" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>Next</Button>
      </div>
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
