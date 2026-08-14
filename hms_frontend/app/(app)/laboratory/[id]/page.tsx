"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { Alert, Badge, Button, Card, Spinner } from "@hms/ui";
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
          <Button variant="secondary" className="print:hidden" onClick={() => window.print()}>
            <Printer size={16} strokeWidth={2} /> Print
          </Button>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-fg-muted">
                  <th className="py-2 pr-3 font-medium">Test</th>
                  <th className="py-2 px-3 font-medium">Result</th>
                  <th className="py-2 px-3 font-medium">Unit</th>
                  <th className="py-2 px-3 font-medium">Reference</th>
                  <th className="py-2 pl-3 font-medium">Flag</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/60">
                  <td className="py-2 pr-3 text-fg">
                    {order.testName}
                    {order.testCode && <span className="ml-2 font-mono text-xs text-fg-subtle">{order.testCode}</span>}
                  </td>
                  <td className="py-2 px-3 font-medium text-fg">{r.value}</td>
                  <td className="py-2 px-3 text-fg-muted">{r.unit ?? "—"}</td>
                  <td className="py-2 px-3 text-fg-muted">{r.refLow || r.refHigh ? `${r.refLow ?? ""}–${r.refHigh ?? ""}` : "—"}</td>
                  <td className="py-2 pl-3">
                    <Badge tone={flagTone(r.flag)}>{r.flag}</Badge>
                  </td>
                </tr>
              </tbody>
            </table>
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
