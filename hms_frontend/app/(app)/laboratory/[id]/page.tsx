"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { Alert, Badge, Button, Card, DataTable, EmptyValue, Spinner, type Column, ValueOrEmpty } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { LabOrder } from "@hms/types";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";
import { PageHeader } from "../../../../components/PageHeader";

function flagTone(f: string): "success" | "warning" | "danger" | "neutral" {
  if (f === "normal") return "success";
  if (f === "critical") return "danger";
  if (f === "high" || f === "low") return "warning";
  return "neutral";
}

/** The signed report line — one row, rendered through the shared table (ADR-029). */
type ResultRow = { order: LabOrder; result: NonNullable<LabOrder["result"]> };

const resultColumns: Array<Column<ResultRow>> = [
  {
    key: "test",
    header: "Test",
    cell: ({ order }) => (
      <span className="text-fg">
        {order.testName}
        {order.testCode && <span className="ml-2 font-mono text-xs text-fg-subtle">{order.testCode}</span>}
      </span>
    ),
  },
  { key: "value", header: "Result", cell: ({ result }) => <span className="font-medium text-fg">{result.value}</span> },
  {
    key: "unit",
    header: "Unit",
    cell: ({ result }) => <ValueOrEmpty value={result.unit} reason="notApplicable" className="text-fg-muted" />,
  },
  {
    key: "reference",
    header: "Reference",
    cell: ({ result }) => (
      <span className="text-fg-muted">
        {result.refLow || result.refHigh ? (
          `${result.refLow ?? ""}–${result.refHigh ?? ""}`
        ) : (
          <EmptyValue reason="notApplicable" />
        )}
      </span>
    ),
  },
  { key: "flag", header: "Flag", cell: ({ result }) => <Badge tone={flagTone(result.flag)}>{result.flag}</Badge> },
];

function Report({ id }: { id: string }) {
  const [order, setOrder] = useState<LabOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOrder(await api.getLabOrder(id));
      setError(null);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Failed to load the report.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-fg-muted">
        <Spinner /> Loading report…
      </div>
    );
  }
  if (!order) return <Alert tone="danger">{error ?? "Report not found."}</Alert>;

  const r = order.result;

  return (
    <>
      <Link href="/laboratory" className="print:hidden inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft size={15} strokeWidth={2} /> Laboratory
      </Link>
      <PageHeader
        title="Lab report"
        description={`${order.patientName} · ${order.patientUhid}`}
        actions={
          // Opens the report DOCUMENT (ADR-047) rather than printing this screen.
          <Link href={`/print/lab-order/${id}`}>
            <Button variant="secondary">
              <Printer size={16} strokeWidth={2} /> Print / PDF
            </Button>
          </Link>
        }
      />

      <Card
        header={
          <div className="flex items-center justify-between">
            <span>{order.testName}</span>
            {r && <Badge tone={flagTone(r.flag)}>{r.flag}</Badge>}
          </div>
        }
      >
        {!r ? (
          <p className="text-sm text-fg-muted">No result entered yet (status: {order.status}).</p>
        ) : (
          <div>
            {/* A signed report line: the shared table with its controls turned off. */}
            <DataTable
              columns={resultColumns}
              rows={[{ order, result: r }]}
              rowKey={() => order.id}
              pagination={false}
              columnVisibility={false}
              searchable={false}
              stickyHeader={false}
            />
            {r.notes && <p className="mt-3 text-sm text-fg-muted">Notes: {r.notes}</p>}
          </div>
        )}
      </Card>
    </>
  );
}

export default function LabReportPage() {
  const params = useParams<{ id: string }>();
  return (
    <RequirePermission perm={PERMISSIONS.LAB_ORDER_VIEW}>
      <Report id={params.id} />
    </RequirePermission>
  );
}
