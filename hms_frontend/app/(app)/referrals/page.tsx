"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserCheck, X } from "lucide-react";
import { Badge, DataTable, TableAction, TableActions, actionsColumn, type Column } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { Referral } from "@hms/types";
import { formatDateTime } from "@hms/utils";
import * as api from "../../../lib/api";
import { RequirePermission } from "../../../components/Can";
import { PageHeader } from "../../../components/PageHeader";
import { useCan } from "../../../lib/auth";

/**
 * The referral worklist (ADR-068).
 *
 * A consultation ends with "send them to Cardiology" — this is where that instruction
 * lands. Each pending row is a patient somebody still has to route: the desk checks
 * them in against the referral (which carries the patient, department, and doctor into
 * the check-in form), or cancels it if the plan changed. Completing happens only
 * through check-in — a referral is "done" when the next visit exists, never by hand.
 */

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  completed: "Completed",
  cancelled: "Cancelled",
};

function statusTone(s: string): "warning" | "success" | "neutral" {
  if (s === "completed") return "success";
  if (s === "cancelled") return "neutral";
  return "warning"; // pending — someone still has to act on it
}

function ReferralWorklist() {
  const router = useRouter();
  const canCheckin = useCan(PERMISSIONS.OPD_CHECKIN);
  const canUpdate = useCan(PERMISSIONS.REFERRAL_UPDATE);
  const [rows, setRows] = useState<Referral[]>([]);
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listReferrals({ status }));
      setError(null);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Could not load referrals.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(r: Referral) {
    setBusyId(r.id);
    try {
      await api.cancelReferral(r.id);
      await load();
    } catch {
      /* reported by the shared API-feedback layer */
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const columns: Array<Column<Referral>> = [
    {
      key: "patient",
      header: "Patient",
      hideable: false,
      accessor: (r) => `${r.patientName} ${r.patientUhid}`,
      cell: (r) => (
        <Link href={`/patients/${r.patientId}`} className="text-brand hover:underline">
          {r.patientName} <span className="font-mono text-xs text-fg-muted">{r.patientUhid}</span>
        </Link>
      ),
    },
    {
      key: "from",
      header: "From",
      accessor: (r) => `${r.visitNumber} ${r.fromProviderName ?? ""}`,
      cell: (r) => (
        <span className="whitespace-nowrap">
          <Link href={`/opd/${r.visitId}`} className="font-mono text-xs text-brand hover:underline">
            {r.visitNumber}
          </Link>
          {r.fromProviderName && <span className="ml-2 text-fg-muted">{r.fromProviderName}</span>}
        </span>
      ),
    },
    {
      key: "toDepartment",
      header: "To department",
      filterable: true,
      accessor: (r) => r.toDepartmentName,
      cell: (r) => r.toDepartmentName,
    },
    {
      key: "toDoctor",
      header: "To doctor",
      filterable: true,
      accessor: (r) => r.toProviderName ?? "Any",
      cell: (r) => r.toProviderName ?? <span className="text-fg-subtle">Any</span>,
    },
    {
      key: "reason",
      header: "Reason",
      accessor: (r) => r.reason,
      cell: (r) => <span className="text-fg-muted">{r.reason}</span>,
    },
    {
      key: "createdAt",
      header: "Created",
      sortable: true,
      accessor: (r) => r.createdAt,
      cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.createdAt)}</span>,
    },
    {
      key: "status",
      header: "Status",
      accessor: (r) => STATUS_LABEL[r.status] ?? r.status,
      cell: (r) => <Badge tone={statusTone(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</Badge>,
    },
    actionsColumn<Referral>((r) => (
      <TableActions label={`Actions for ${r.patientName}`}>
        <TableAction
          label="Check in"
          icon={<UserCheck size={16} strokeWidth={2} aria-hidden />}
          permitted={canCheckin && r.status === "pending"}
          onSelect={() => router.push(`/opd/check-in?referralId=${r.id}`)}
        />
        <TableAction
          label="Cancel referral"
          icon={<X size={16} strokeWidth={2} aria-hidden />}
          tone="danger"
          permitted={canUpdate && r.status === "pending"}
          loading={busyId === r.id}
          confirm={{
            title: `Cancel ${r.patientName}'s referral?`,
            description:
              "It leaves the pending worklist and nobody is checked in against it. The visit it came from is unaffected.",
            confirmLabel: "Cancel referral",
          }}
          onSelect={() => void cancel(r)}
        />
      </TableActions>
    )),
  ];

  return (
    <>
      <PageHeader
        title="Referrals"
        description="Cross-department referrals — check the patient in to send them to the next doctor."
      />
      <div className="flex items-center gap-2">
        <span className="text-sm text-fg-muted">Status:</span>
        <select
          className="hms-input max-w-[14rem]"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        searchPlaceholder="Search by patient, doctor, or department…"
        emptyMessage={`No ${status} referrals.`}
        emptyDescription={
          status === "pending"
            ? "A doctor creates one by referring the patient during a consultation."
            : undefined
        }
      />
    </>
  );
}

export default function ReferralsPage() {
  return (
    <RequirePermission perm={PERMISSIONS.REFERRAL_VIEW}>
      <ReferralWorklist />
    </RequirePermission>
  );
}
