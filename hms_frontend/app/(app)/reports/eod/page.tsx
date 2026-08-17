"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  DateField,
  StatCard,
  type Column,
} from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { CollectionsReport, OpdRegisterRow, PendingLabRow } from "@hms/types";
import { formatDate, formatDateTime } from "@hms/utils";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";
import { PageHeader } from "../../../../components/PageHeader";
import { formatPaise } from "../../../../lib/money";
import { downloadCsv } from "../../../../lib/csv";

/**
 * The hospital's end-of-day report (requirement #2). A single day's operating
 * picture on one screen — visits, what was collected, and what is still pending —
 * built entirely on the existing reports endpoints (`from === to === the day`), so
 * it invents no metric the platform cannot already produce. Gated by
 * `reports.view`, the same permission as Reports.
 */
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function EodReport() {
  const today = useMemo(() => iso(new Date()), []);
  const [day, setDay] = useState(today);

  const [opd, setOpd] = useState<OpdRegisterRow[]>([]);
  const [collections, setCollections] = useState<CollectionsReport | null>(null);
  const [pending, setPending] = useState<PendingLabRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const [o, c, p] = await Promise.all([
        api.reportOpdRegister(date, date),
        api.reportCollections(date, date),
        api.reportPendingLabs(),
      ]);
      setOpd(o);
      setCollections(c);
      setPending(p);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Failed to load the end-of-day report.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(day);
  }, [day, load]);

  const completed = opd.filter((r) => r.status === "completed").length;

  const opdCols: Array<Column<OpdRegisterRow>> = [
    { key: "token", header: "Token", accessor: (r) => r.tokenNumber, cell: (r) => `#${r.tokenNumber}` },
    {
      key: "patient",
      header: "Patient",
      hideable: false,
      accessor: (r) => `${r.patientName} ${r.patientUhid}`,
      cell: (r) => (
        <span>
          {r.patientName} <span className="font-mono text-xs text-fg-muted">{r.patientUhid}</span>
        </span>
      ),
    },
    { key: "provider", header: "Provider", filterable: true, accessor: (r) => r.providerName ?? "—", cell: (r) => r.providerName ?? "—" },
    {
      key: "status",
      header: "Status",
      filterable: true,
      accessor: (r) => r.status,
      cell: (r) => <Badge tone={r.status === "completed" ? "success" : "neutral"}>{r.status}</Badge>,
    },
    {
      key: "invoice",
      header: "Invoice",
      accessor: (r) => r.invoiceTotalPaise ?? 0,
      cell: (r) => (r.invoiceNumber ? `${r.invoiceNumber} · ${formatPaise(r.invoiceTotalPaise ?? 0)}` : "—"),
    },
  ];

  const collectionCols: Array<Column<CollectionsReport["rows"][number]>> = [
    { key: "when", header: "When", hideable: false, accessor: (r) => r.collectedAt, cell: (r) => formatDateTime(r.collectedAt) },
    {
      key: "patient",
      header: "Patient",
      accessor: (r) => `${r.patientName} ${r.patientUhid}`,
      cell: (r) => (
        <span>
          {r.patientName} <span className="font-mono text-xs text-fg-muted">{r.patientUhid}</span>
        </span>
      ),
    },
    { key: "invoice", header: "Invoice", accessor: (r) => r.invoiceNumber, cell: (r) => <span className="font-mono text-xs">{r.invoiceNumber}</span> },
    { key: "method", header: "Method", filterable: true, accessor: (r) => r.method.toUpperCase(), cell: (r) => r.method.toUpperCase() },
    { key: "amount", header: "Amount", accessor: (r) => r.amountPaise, cell: (r) => formatPaise(r.amountPaise) },
  ];

  function exportCsv() {
    downloadCsv(
      `eod-visits_${day}.csv`,
      ["Token", "Patient", "UHID", "Provider", "Status", "Invoice", "Total (₹)"],
      opd.map((r) => [
        r.tokenNumber,
        r.patientName,
        r.patientUhid,
        r.providerName ?? "",
        r.status,
        r.invoiceNumber ?? "",
        (r.invoiceTotalPaise ?? 0) / 100,
      ]),
    );
  }

  return (
    <>
      <PageHeader
        title="End-of-day report"
        description={`A single day's visits, collections and what is still pending — ${formatDate(day)}.`}
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <DateField label="Day" value={day || null} max={today} onChange={(v) => setDay(v ?? today)} />
            <Button variant="secondary" onClick={exportCsv}>
              <Download size={16} strokeWidth={2} /> Export CSV
            </Button>
          </div>
        }
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Visits" value={loading ? null : opd.length} hint={`${completed} completed`} />
        <StatCard label="Collected" value={loading || !collections ? null : formatPaise(collections.totalPaise)} hint={collections ? `${collections.count} payment${collections.count === 1 ? "" : "s"}` : undefined} />
        <StatCard label="Payments" value={loading || !collections ? null : collections.count} />
        <StatCard
          label="Labs still pending"
          value={loading ? null : pending.length}
          hint="Ordered, not yet resulted"
          invertDelta
        />
      </div>

      <Card header={`Visits — ${formatDate(day)}`}>
        <DataTable
          columns={opdCols}
          rows={opd}
          rowKey={(r) => r.visitNumber}
          loading={loading}
          emptyMessage="No visits on this day."
        />
      </Card>

      <Card
        header={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Collections — {formatDate(day)}</span>
            {collections && collections.byMethod.length > 0 ? (
              <span className="flex flex-wrap items-center gap-3 text-xs font-normal text-fg-muted">
                {collections.byMethod.map((m) => (
                  <span key={m.method} className="uppercase">
                    {m.method}: {formatPaise(m.totalPaise)}
                  </span>
                ))}
              </span>
            ) : null}
          </div>
        }
      >
        <DataTable
          columns={collectionCols}
          rows={collections?.rows ?? []}
          rowKey={(r) => r.id}
          loading={loading}
          emptyMessage="No collections on this day."
        />
      </Card>
    </>
  );
}

export default function EodReportPage() {
  return (
    <RequirePermission perm={PERMISSIONS.REPORTS_VIEW}>
      <EodReport />
    </RequirePermission>
  );
}
