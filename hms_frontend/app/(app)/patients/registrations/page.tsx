"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Alert, DataTable, TableAction, TableActions, actionsColumn, type Column } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { RegistrationRequestItem } from "@hms/types";
import { formatDate, formatDateTime } from "@hms/utils";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";
import { PageHeader } from "../../../../components/PageHeader";
import { useCan } from "../../../../lib/auth";

/**
 * The self-registration review queue (ADR-056).
 *
 * This is where a *request* becomes a *patient*. Nothing before this point has created a
 * record, which is the whole point: the hospital still decides who is in its patient list
 * (ADR-052), and the person at the desk is the one who can check an ID and spot that this
 * is the same Meera Joshi who came last month.
 *
 * Two permissions, deliberately: **seeing** the queue is `patient.record.view`, so the
 * administrator who switched registration on and printed the QR can tell whether anything
 * arrived. **Approving or rejecting** is `patient.record.create`, the same permission as
 * registering a patient by hand, and both are audited. An administrator without it sees
 * the queue with no action buttons — and the server refuses regardless.
 */

function name(r: RegistrationRequestItem): string {
  return [r.firstName, r.lastName].filter(Boolean).join(" ");
}

function columns(
  canReview: boolean,
  busyId: string | null,
  onApprove: (r: RegistrationRequestItem) => void,
  onReject: (r: RegistrationRequestItem) => void,
): Array<Column<RegistrationRequestItem>> {
  return [
    {
      key: "name",
      header: "Name",
      sortable: true,
      hideable: false,
      accessor: name,
      cell: (r) => <span className="font-medium text-fg">{name(r)}</span>,
    },
    { key: "phone", header: "Phone", accessor: (r) => r.phone, cell: (r) => r.phone },
    { key: "gender", header: "Gender", filterable: true, accessor: (r) => r.gender ?? "—", cell: (r) => r.gender ?? "—" },
    {
      key: "dateOfBirth",
      header: "Date of birth",
      accessor: (r) => r.dateOfBirth ?? "",
      cell: (r) => (r.dateOfBirth ? formatDate(r.dateOfBirth) : "—"),
    },
    { key: "email", header: "Email", defaultHidden: true, accessor: (r) => r.email ?? "—", cell: (r) => r.email ?? "—" },
    { key: "city", header: "City", filterable: true, accessor: (r) => r.city ?? "—", cell: (r) => r.city ?? "—" },
    {
      key: "note",
      header: "Their note",
      defaultHidden: true,
      accessor: (r) => r.note ?? "",
      cell: (r) => <span className="text-fg-muted">{r.note || "—"}</span>,
    },
    {
      key: "createdAt",
      header: "Submitted",
      sortable: true,
      accessor: (r) => r.createdAt,
      cell: (r) => formatDateTime(r.createdAt),
    },
    actionsColumn<RegistrationRequestItem>((r) => (
      <TableActions label={`Actions for ${name(r)}`}>
        <TableAction
          label="Register as a patient"
          icon={<Check size={16} strokeWidth={2} aria-hidden />}
          permitted={canReview}
          loading={busyId === r.id}
          confirm={{
            title: `Register ${name(r)}?`,
            description:
              "This creates a patient record with the details they submitted, and issues a UHID. Check for an existing record for this person first — you can edit anything they got wrong afterwards.",
            confirmLabel: "Register patient",
          }}
          onSelect={() => onApprove(r)}
        />
        <TableAction
          label="Reject"
          icon={<X size={16} strokeWidth={2} aria-hidden />}
          tone="danger"
          permitted={canReview}
          loading={busyId === r.id}
          confirm={{
            title: `Reject ${name(r)}'s request?`,
            description: "No patient record is created. The request is kept, marked rejected, so it can be accounted for later.",
            confirmLabel: "Reject",
          }}
          onSelect={() => onReject(r)}
        />
      </TableActions>
    )),
  ];
}

function ReviewQueue() {
  const router = useRouter();
  const canReview = useCan(PERMISSIONS.PATIENT_CREATE);
  const [rows, setRows] = useState<RegistrationRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listRegistrationRequests("pending"));
      setError(null);
    } catch {
      setError("Could not load registration requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(r: RegistrationRequestItem) {
    setBusyId(r.id);
    try {
      const { patientId } = await api.approveRegistrationRequest(r.id);
      // Straight to the new record — the desk almost always needs to correct or complete
      // something the patient typed on a phone.
      router.push(`/patients/${patientId}`);
    } catch {
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function reject(r: RegistrationRequestItem) {
    setBusyId(r.id);
    try {
      await api.rejectRegistrationRequest(r.id);
      setRows((s) => s.filter((x) => x.id !== r.id));
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Registration requests"
        description={loading ? "Loading…" : `${rows.length} waiting for review`}
      />

      <Alert>
        These people filled in your hospital&apos;s registration form — from the QR code or link. They are{" "}
        <strong className="font-medium">not patients yet</strong>.{" "}
        {canReview
          ? "Check the details, look for an existing record, then register them."
          : "Your front desk reviews each one and completes the registration."}
      </Alert>

      <DataTable
        columns={columns(canReview, busyId, approve, reject)}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        searchPlaceholder="Search by name or phone…"
        emptyMessage="Nothing waiting"
        emptyDescription="Requests appear here when someone fills in your hospital's registration form."
        urlState
      />
    </>
  );
}

export default function RegistrationRequestsPage() {
  return (
    <RequirePermission perm={PERMISSIONS.PATIENT_VIEW}>
      <ReviewQueue />
    </RequirePermission>
  );
}
