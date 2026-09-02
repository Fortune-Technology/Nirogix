"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  actionsColumn,
  Badge,
  Button,
  DataTable,
  DateRangeFilter,
  EditAction,
  emptyLabel,
  TableActions,
  ToggleAction,
  type Column,
  type DataTableQuery,
  type DateRangeValue,
  valueLabel,
  ValueOrEmpty,
  ViewAction,
} from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { Patient } from "@hms/types";
import { ageInYears, formatDate } from "@hms/utils";
import * as api from "../../../lib/api";
import { RequirePermission, Can } from "../../../components/Can";
import { PageHeader } from "../../../components/PageHeader";
import { useCan } from "../../../lib/auth";

// One calculation, shared with the patient chart's identity strip (ADR-127) — a list and the
// record it opens must not disagree about somebody's age.
function age(dob: string | null): string {
  const years = ageInYears(dob);
  return years === null ? emptyLabel("notRecorded") : `${years}y`;
}

/**
 * Patients is a *configuration* of the Standard DataTable, not a table (ADR-029).
 * The dataset is large, so it runs in server mode: the API owns paging and search
 * and the table only reports what the user asked for.
 */
function patientColumns(
  canEdit: boolean,
  onView: (p: Patient) => void,
  onEdit: (p: Patient) => void,
  onToggle: (p: Patient) => void,
): Array<Column<Patient>> {
  return [
    {
      key: "uhid",
      header: "UHID",
      sortable: true,
      hideable: false,
      accessor: (p) => p.uhid,
      cell: (p) => (
        <Link href={`/patients/${p.id}`} className="font-mono font-medium text-brand hover:underline">
          {p.uhid}
        </Link>
      ),
    },
    {
      key: "name",
      header: "Name",
      sortable: true,
      hideable: false,
      accessor: (p) => [p.firstName, p.lastName].filter(Boolean).join(" "),
      cell: (p) => <span className="font-medium text-fg">{[p.firstName, p.lastName].filter(Boolean).join(" ")}</span>,
    },
    {
      key: "gender",
      header: "Gender",
      filterable: true,
      accessor: (p) => valueLabel(p.gender, "unspecified"),
      cell: (p) => <ValueOrEmpty value={p.gender} reason="unspecified" />,
    },
    // Left, like every other label: "24y" is not a magnitude anyone compares down the column.
    { key: "age", header: "Age", accessor: (p) => p.dateOfBirth, cell: (p) => age(p.dateOfBirth) },
    {
      key: "phone",
      header: "Phone",
      accessor: (p) => valueLabel(p.phone, "unspecified"),
      cell: (p) => <ValueOrEmpty value={p.phone} reason="unspecified" />,
    },
    {
      key: "city",
      header: "City",
      filterable: true,
      accessor: (p) => valueLabel(p.city, "unspecified"),
      cell: (p) => <ValueOrEmpty value={p.city} reason="unspecified" />,
    },
    {
      key: "registered",
      header: "Registered",
      sortable: true,
      defaultHidden: true,
      accessor: (p) => p.createdAt,
      cell: (p) => formatDate(p.createdAt),
    },
    {
      key: "status",
      header: "Status",
      filterable: true,
      accessor: (p) => p.status,
      cell: (p) => <Badge tone={p.status === "active" ? "success" : "neutral"}>{p.status}</Badge>,
    },
    actionsColumn<Patient>((p) => (
      <TableActions label={`Actions for ${[p.firstName, p.lastName].filter(Boolean).join(" ")}`}>
        <ViewAction label="View record" onSelect={() => onView(p)} />
        <EditAction label="Edit details" permitted={canEdit} onSelect={() => onEdit(p)} />
        {/* Deactivate, never delete (ADR-060). A patient record is referenced by
            visits, prescriptions, lab orders and invoices; destroying it would orphan
            a clinical history the hospital is obliged to keep. */}
        <ToggleAction
          on={p.status === "active"}
          permitted={canEdit}
          onLabel="Deactivate patient"
          offLabel="Reactivate patient"
          confirm={{
            title: `Deactivate ${[p.firstName, p.lastName].filter(Boolean).join(" ")}?`,
            description:
              "The record stays, along with every visit, prescription and bill attached to it. It is hidden from day-to-day lists and cannot be booked. You can reactivate at any time.",
            confirmLabel: "Deactivate",
          }}
          onToggle={() => onToggle(p)}
        />
      </TableActions>
    )),
  ];
}

function PatientsTable() {
  const router = useRouter();
  const canEdit = useCan(PERMISSIONS.PATIENT_CREATE);
  const [rows, setRows] = useState<Patient[]>([]);
  const [query, setQuery] = useState<DataTableQuery>({ page: 1, pageSize: 20, search: "", sort: [], filters: {} });
  // Registration date-range lives beside `query`: it is a structured range, not a
  // faceted multi-select, so it travels as its own params rather than in `filters` (ADR-063).
  const [registered, setRegistered] = useState<DateRangeValue>({ from: null, to: null });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q: DataTableQuery, reg: DateRangeValue) => {
    setLoading(true);
    try {
      const res = await api.listPatients(q.page, q.pageSize, q.search || undefined, q.filters, reg);
      setRows(res.data);
      setTotal(res.page.total);
      setError(null);
    } catch {
      // The shared toast already told the user; the table shows its error state.
      setError("Could not load patients.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(query, registered);
  }, [query, registered, load]);

  /**
   * Soft state change only — `status`, never a delete. The server re-checks the
   * permission regardless of whether the action was rendered (ADR-060), and the change
   * is audited like any other patient update.
   */
  async function toggleStatus(p: Patient) {
    try {
      // The API's patient states are `active` | `archived` (never deleted, ADR-060).
      await api.updatePatient(p.id, { status: p.status === "active" ? "archived" : "active" });
      await load(query, registered);
    } catch {
      /* reported by the shared API-feedback layer */
    }
  }

  return (
    <>
      <PageHeader
        title="Patients"
        description={`${total} registered`}
        actions={
          <Can perm={PERMISSIONS.PATIENT_CREATE}>
            <Link href="/patients/new">
              <Button>
                <Plus size={16} strokeWidth={2} /> Register patient
              </Button>
            </Link>
          </Can>
        }
      />
      <DataTable
        columns={patientColumns(
          canEdit,
          (p) => router.push(`/patients/${p.id}`),
          (p) => router.push(`/patients/${p.id}?edit=1`),
          (p) => void toggleStatus(p),
        )}
        rows={rows}
        rowKey={(p) => p.id}
        loading={loading}
        error={error}
        onRetry={() => void load(query, registered)}
        searchPlaceholder="Search by UHID, name, or phone…"
        filters={
          <DateRangeFilter
            label="Registered"
            value={registered}
            onChange={(r) => {
              setRegistered(r);
              setQuery((q) => ({ ...q, page: 1 }));
            }}
          />
        }
        emptyMessage={query.search ? "No patients match your search." : "No patients registered yet."}
        emptyDescription={
          query.search ? "Try a different UHID, name, or phone number." : "Register the first patient to get started."
        }
        emptyAction={
          <Can perm={PERMISSIONS.PATIENT_CREATE}>
            <Link href="/patients/new">
              <Button size="sm">
                <Plus size={16} strokeWidth={2} /> Register patient
              </Button>
            </Link>
          </Can>
        }
        urlState
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

export default function PatientsPage() {
  return (
    <RequirePermission perm={PERMISSIONS.PATIENT_VIEW}>
      <PatientsTable />
    </RequirePermission>
  );
}
