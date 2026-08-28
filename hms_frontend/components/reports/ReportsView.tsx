"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  PeriodFilter,
  Spinner,
  usePeriodParam,
  type Column,
} from "@hms/ui";
import type { OpdRegisterRow, CollectionsReport, PendingLabRow } from "@hms/types";
import { formatDate, formatDateTime } from "@hms/utils";
import * as api from "../../lib/api";
import { PageHeader } from "../PageHeader";
import { ReportsTabs } from "./ReportsTabs";
import { formatPaise } from "../../lib/money";
import { downloadCsv } from "../../lib/csv";

/**
 * The Reports registers, one per route. `view` comes from which route mounted this
 * (`/reports`, `/reports/collections`, `/reports/pending-labs`) rather than local
 * state, so the URL is the source of truth for which register is open and the tab
 * bar is plain `<Link>`s. The date window is per-view (defaults to the last week);
 * the "Pending labs" register has no window.
 */
export type ReportView = "opd" | "collections" | "pending";

// Registers read over days-to-a-year; the report endpoints cap a range at 366 days,
// so the longer month/24-month presets are deliberately left off here.
const REPORT_PRESETS = [
  "today",
  "yesterday",
  "thisWeek",
  "last7Days",
  "last30Days",
  "thisMonth",
  "lastMonth",
  "thisFinancialYear",
  "lastFinancialYear",
  "custom",
] as const;

export function ReportsView({ view }: { view: ReportView }) {
  const [period, setPeriod] = usePeriodParam("last7Days");
  const from = period.start;
  const to = period.end;

  const [opd, setOpd] = useState<OpdRegisterRow[]>([]);
  const [collections, setCollections] = useState<CollectionsReport | null>(null);
  const [pending, setPending] = useState<PendingLabRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (view === "opd") setOpd(await api.reportOpdRegister(from, to));
      else if (view === "collections") setCollections(await api.reportCollections(from, to));
      else setPending(await api.reportPendingLabs());
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Failed to load the report.");
    } finally {
      setLoading(false);
    }
  }, [view, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const opdCols: Array<Column<OpdRegisterRow>> = [
    { key: "visit", header: "Visit", hideable: false, accessor: (r) => r.visitNumber, cell: (r) => <span className="font-mono text-xs">{r.visitNumber}</span> },
    { key: "token", header: "Token", accessor: (r) => r.tokenNumber, cell: (r) => `#${r.tokenNumber}` },
    { key: "date", header: "Date", accessor: (r) => r.visitDate, cell: (r) => formatDate(r.visitDate) },
    { key: "patient", header: "Patient", accessor: (r) => `${r.patientName} ${r.patientUhid}`, cell: (r) => <span>{r.patientName} <span className="font-mono text-xs text-fg-muted">{r.patientUhid}</span></span> },
    { key: "provider", header: "Provider", filterable: true, accessor: (r) => r.providerName ?? "—", cell: (r) => r.providerName ?? "—" },
    { key: "status", header: "Status", filterable: true, accessor: (r) => r.status, cell: (r) => <Badge tone={r.status === "completed" ? "success" : "neutral"}>{r.status}</Badge> },
    { key: "invoice", header: "Invoice", accessor: (r) => r.invoiceTotalPaise ?? 0, cell: (r) => (r.invoiceNumber ? `${r.invoiceNumber} · ${formatPaise(r.invoiceTotalPaise ?? 0)}` : "—") },
  ];

  const pendingCols: Array<Column<PendingLabRow>> = [
    { key: "test", header: "Test", hideable: false, accessor: (r) => r.testName, cell: (r) => r.testName },
    { key: "patient", header: "Patient", accessor: (r) => `${r.patientName} ${r.patientUhid}`, cell: (r) => <span>{r.patientName} <span className="font-mono text-xs text-fg-muted">{r.patientUhid}</span></span> },
    { key: "priority", header: "Priority", filterable: true, accessor: (r) => r.priority, cell: (r) => (r.priority === "urgent" ? <Badge tone="danger">urgent</Badge> : r.priority) },
    { key: "status", header: "Status", filterable: true, accessor: (r) => r.status, cell: (r) => <Badge tone="warning">{r.status}</Badge> },
    { key: "ordered", header: "Ordered", accessor: (r) => r.orderedAt, cell: (r) => formatDateTime(r.orderedAt) },
  ];

  const collectionCols: Array<Column<CollectionsReport["rows"][number]>> = [
    { key: "when", header: "When", hideable: false, accessor: (r) => r.collectedAt, cell: (r) => formatDateTime(r.collectedAt) },
    { key: "patient", header: "Patient", accessor: (r) => `${r.patientName} ${r.patientUhid}`, cell: (r) => <span>{r.patientName} <span className="font-mono text-xs text-fg-muted">{r.patientUhid}</span></span> },
    { key: "invoice", header: "Invoice", accessor: (r) => r.invoiceNumber, cell: (r) => <span className="font-mono text-xs">{r.invoiceNumber}</span> },
    { key: "method", header: "Method", filterable: true, accessor: (r) => r.method.toUpperCase(), cell: (r) => r.method.toUpperCase() },
    { key: "amount", header: "Amount", accessor: (r) => r.amountPaise, cell: (r) => formatPaise(r.amountPaise) },
  ];

  function exportCsv() {
    if (view === "opd") {
      downloadCsv(
        `opd-register_${from}_${to}.csv`,
        ["Visit", "Token", "Date", "Patient", "UHID", "Provider", "Status", "Invoice", "Total (₹)"],
        opd.map((r) => [r.visitNumber, r.tokenNumber, r.visitDate, r.patientName, r.patientUhid, r.providerName ?? "", r.status, r.invoiceNumber ?? "", (r.invoiceTotalPaise ?? 0) / 100]),
      );
    } else if (view === "collections" && collections) {
      downloadCsv(
        `collections_${from}_${to}.csv`,
        ["When", "Patient", "UHID", "Invoice", "Method", "Amount (₹)"],
        collections.rows.map((r) => [r.collectedAt, r.patientName, r.patientUhid, r.invoiceNumber, r.method, r.amountPaise / 100]),
      );
    } else if (view === "pending") {
      downloadCsv(
        `pending-labs.csv`,
        ["Test", "Patient", "UHID", "Priority", "Status", "Ordered"],
        pending.map((r) => [r.testName, r.patientName, r.patientUhid, r.priority, r.status, r.orderedAt]),
      );
    }
  }

  return (
    <>
      <PageHeader
        title="Reports"
        description="Operational registers and summaries for your hospital, exportable to CSV."
        actions={<Button variant="secondary" onClick={exportCsv}><Download size={16} strokeWidth={2} /> Export CSV</Button>}
      />

      <ReportsTabs />

      {view !== "pending" && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <PeriodFilter value={period} onChange={setPeriod} presets={[...REPORT_PRESETS]} label="Period" align="end" />
        </div>
      )}

      {error && <Alert tone="danger">{error}</Alert>}

      {loading ? (
        <div className="flex items-center gap-2 text-fg-muted"><Spinner /> Loading…</div>
      ) : view === "opd" ? (
        <DataTable columns={opdCols} rows={opd} rowKey={(r) => r.visitNumber} emptyMessage="No visits in this range." />
      ) : view === "pending" ? (
        <DataTable columns={pendingCols} rows={pending} rowKey={(r, i) => `${r.patientUhid}-${i}`} emptyMessage="No pending lab results." />
      ) : collections ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card><div className="text-xs text-fg-muted">Total collected</div><div className="text-2xl font-semibold text-fg">{formatPaise(collections.totalPaise)}</div></Card>
            <Card><div className="text-xs text-fg-muted">Payments</div><div className="text-2xl font-semibold text-fg">{collections.count}</div></Card>
            <Card>
              <div className="text-xs text-fg-muted">By method</div>
              <div className="mt-1 flex flex-col gap-0.5 text-sm text-fg">
                {collections.byMethod.length === 0 ? <span className="text-fg-subtle">—</span> : collections.byMethod.map((m) => (
                  <div key={m.method} className="flex justify-between"><span className="uppercase text-fg-muted">{m.method}</span><span>{formatPaise(m.totalPaise)}</span></div>
                ))}
              </div>
            </Card>
          </div>
          <DataTable columns={collectionCols} rows={collections.rows} rowKey={(r) => r.id} emptyMessage="No collections in this range." />
        </>
      ) : null}
    </>
  );
}
