"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { UserCheck } from "lucide-react";
import { Badge, Button, DataTable, type Column } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { Visit } from "@hms/types";
import { formatTime } from "@hms/utils";
import * as api from "../../../lib/api";
import { RequirePermission, Can } from "../../../components/Can";
import { PageHeader } from "../../../components/PageHeader";
import { useCan } from "../../../lib/auth";
import { formatPaise } from "../../../lib/money";

function statusTone(s: string): "success" | "warning" | "neutral" | "danger" | "brand" {
  if (s === "checked_in") return "warning";
  if (s === "in_consultation") return "brand";
  if (s === "completed") return "success";
  if (s === "cancelled") return "danger";
  return "neutral";
}

function invoiceTone(s: string): "success" | "warning" | "neutral" | "danger" {
  if (s === "paid") return "success";
  if (s === "partially_paid") return "warning";
  if (s === "void") return "neutral";
  return "danger"; // draft = unpaid
}

const STATUS_LABEL: Record<string, string> = {
  checked_in: "Checked in",
  in_consultation: "In consultation",
  completed: "Completed",
  cancelled: "Cancelled",
};

function OpdQueue() {
  const [rows, setRows] = useState<Visit[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canUpdate = useCan(PERMISSIONS.OPD_UPDATE);
  const canConsult = useCan(PERMISSIONS.EMR_VIEW);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listVisits({ status: status || undefined }));
      setError(null);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Failed to load the queue.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function advance(v: Visit, next: "in_consultation" | "completed") {
    setBusy(true);
    try {
      await api.updateVisitStatus(v.id, { status: next, version: undefined });
      await load();
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Could not update the visit.");
    } finally {
      setBusy(false);
    }
  }

  const columns: Array<Column<Visit>> = [
    {
      key: "token",
      header: "Token",
      hideable: false,
      accessor: (v) => v.tokenNumber,
      cell: (v) => <span className="font-mono text-base font-semibold text-fg">#{v.tokenNumber}</span>,
    },
    {
      key: "patient",
      header: "Patient",
      hideable: false,
      accessor: (v) => `${v.patientName} ${v.patientUhid}`,
      cell: (v) => (
        <Link href={`/patients/${v.patientId}`} className="text-brand hover:underline">
          {v.patientName} <span className="font-mono text-xs text-fg-muted">{v.patientUhid}</span>
        </Link>
      ),
    },
    {
      key: "provider",
      header: "Provider",
      filterable: true,
      accessor: (v) => v.providerName ?? "—",
      cell: (v) => v.providerName ?? <span className="text-fg-subtle">—</span>,
    },
    {
      key: "since",
      header: "Checked in",
      accessor: (v) => v.checkedInAt,
      cell: (v) => <span className="whitespace-nowrap text-fg-muted">{formatTime(v.checkedInAt)}</span>,
    },
    {
      key: "status",
      header: "Status",
      filterable: true,
      accessor: (v) => STATUS_LABEL[v.status] ?? v.status,
      cell: (v) => <Badge tone={statusTone(v.status)}>{STATUS_LABEL[v.status] ?? v.status}</Badge>,
    },
    {
      key: "bill",
      header: "Bill",
      accessor: (v) => v.invoice?.status.replace("_", " ") ?? "—",
      cell: (v) =>
        v.invoice ? (
          <Link href={`/billing/${v.invoice.id}`} className="inline-flex items-center gap-2 hover:underline">
            <Badge tone={invoiceTone(v.invoice.status)}>{v.invoice.status.replace("_", " ")}</Badge>
            {v.invoice.balancePaise > 0 && (
              <span className="text-xs text-fg-muted">{formatPaise(v.invoice.balancePaise)} due</span>
            )}
          </Link>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      hideable: false,
      cell: (v) => (
        <div className="flex justify-end gap-2">
          {canConsult && v.status !== "cancelled" && (
            <Link href={`/opd/${v.id}`}>
              <Button variant="secondary" size="sm">
                {v.status === "completed" ? "View" : "Open"}
              </Button>
            </Link>
          )}
          {canUpdate && v.status === "checked_in" && (
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => advance(v, "in_consultation")}>
              Start consult
            </Button>
          )}
          {canUpdate && v.status === "in_consultation" && (
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => advance(v, "completed")}>
              Complete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="OPD queue"
        description="Today's checked-in patients, in token order."
        actions={
          <Can perm={PERMISSIONS.OPD_CHECKIN}>
            <Link href="/opd/check-in">
              <Button>
                <UserCheck size={16} strokeWidth={2} /> Check in
              </Button>
            </Link>
          </Can>
        }
      />
      <div className="flex items-center gap-2">
        <span className="text-sm text-fg-muted">Status:</span>
        <select
          className="hms-input max-w-[14rem]"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All</option>
          <option value="checked_in">Checked in</option>
          <option value="in_consultation">In consultation</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(v) => v.id} loading={loading} error={error} emptyMessage="No patients in the queue today." />
    </>
  );
}

export default function OpdPage() {
  return (
    <RequirePermission perm={PERMISSIONS.OPD_VIEW}>
      <OpdQueue />
    </RequirePermission>
  );
}
