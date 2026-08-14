"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, DataTable, type Column } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { Appointment } from "@hms/types";
import * as api from "../../../lib/api";
import { RequirePermission, Can } from "../../../components/Can";
import { PageHeader } from "../../../components/PageHeader";
import { useCan } from "../../../lib/auth";

function statusTone(s: string): "success" | "warning" | "neutral" | "danger" {
  if (s === "booked") return "success";
  if (s === "cancelled") return "danger";
  if (s === "completed") return "neutral";
  return "warning";
}

function AppointmentsTable() {
  const [rows, setRows] = useState<Appointment[]>([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canCancel = useCan(PERMISSIONS.APPOINTMENT_CANCEL);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listAppointments({ page, pageSize: 20, status: status || undefined });
      setRows(res.data);
      setTotalPages(res.page.totalPages);
      setTotal(res.page.total);
      setError(null);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Failed to load appointments.");
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => { void load(); }, [load]);

  async function cancel(id: string) {
    setBusy(true);
    try {
      await api.cancelAppointment(id, "cancelled from portal");
      await load();
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Could not cancel.");
    } finally {
      setBusy(false);
    }
  }

  const columns: Array<Column<Appointment>> = [
    {
      key: "when",
      header: "When",
      cell: (a) => <span className="whitespace-nowrap text-fg">{new Date(a.scheduledAt).toLocaleString()}</span>,
    },
    {
      key: "patient",
      header: "Patient",
      cell: (a) => (
        <Link href={`/patients/${a.patientId}`} className="text-brand hover:underline">
          {a.patientName} <span className="font-mono text-xs text-fg-muted">{a.patientUhid}</span>
        </Link>
      ),
    },
    { key: "provider", header: "Provider", cell: (a) => a.providerName },
    { key: "dur", header: "Duration", cell: (a) => `${a.durationMinutes}m` },
    { key: "status", header: "Status", cell: (a) => <Badge tone={statusTone(a.status)}>{a.status}</Badge> },
    {
      key: "actions",
      header: "",
      cell: (a) =>
        canCancel && a.status === "booked" ? (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => cancel(a.id)}>Cancel</Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Appointments"
        description={`${total} total`}
        actions={
          <Can perm={PERMISSIONS.APPOINTMENT_CREATE}>
            <Link href="/appointments/new"><Button>+ Book appointment</Button></Link>
          </Can>
        }
      />
      <div className="flex items-center gap-2">
        <span className="text-sm text-fg-muted">Status:</span>
        <select className="hms-input max-w-[12rem]" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          <option value="">All</option>
          <option value="booked">Booked</option>
          <option value="cancelled">Cancelled</option>
          <option value="completed">Completed</option>
        </select>
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(a) => a.id} loading={loading} error={error} emptyMessage="No appointments." />
      <div className="flex items-center justify-end gap-3">
        <span className="text-sm text-fg-muted">Page {page} of {totalPages}</span>
        <Button variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</Button>
        <Button variant="secondary" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>Next</Button>
      </div>
    </>
  );
}

export default function AppointmentsPage() {
  return (
    <RequirePermission perm={PERMISSIONS.APPOINTMENT_VIEW}>
      <AppointmentsTable />
    </RequirePermission>
  );
}
