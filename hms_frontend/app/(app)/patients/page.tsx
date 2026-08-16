"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  Badge,
  Button,
  DataTable,
  EditAction,
  TableActions,
  ViewAction,
  actionsColumn,
  type Column,
  type DataTableQuery,
} from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { Patient } from "@hms/types";
import { formatDate } from "@hms/utils";
import * as api from "../../../lib/api";
import { RequirePermission, Can } from "../../../components/Can";
import { PageHeader } from "../../../components/PageHeader";
import { useCan } from "../../../lib/auth";

function age(dob: string | null): string {
  if (!dob) return "—";
  const d = new Date(dob);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a >= 0 ? `${a}y` : "—";
}

/**
 * Patients is a *configuration* of the Standard DataTable, not a table (ADR-029).
 * The dataset is large, so it runs in server mode: the API owns paging and search
 * and the table only reports what the user asked for.
 */
function patientColumns(canEdit: boolean, onView: (p: Patient) => void, onEdit: (p: Patient) => void): Array<Column<Patient>> {
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
    { key: "gender", header: "Gender", filterable: true, accessor: (p) => p.gender ?? "—", cell: (p) => p.gender ?? "—" },
    { key: "age", header: "Age", align: "right", accessor: (p) => p.dateOfBirth, cell: (p) => age(p.dateOfBirth) },
    { key: "phone", header: "Phone", accessor: (p) => p.phone, cell: (p) => p.phone ?? "—" },
    { key: "city", header: "City", filterable: true, accessor: (p) => p.city ?? "—", cell: (p) => p.city ?? "—" },
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
      </TableActions>
    )),
  ];
}

function PatientsTable() {
  const router = useRouter();
  const canEdit = useCan(PERMISSIONS.PATIENT_CREATE);
  const [rows, setRows] = useState<Patient[]>([]);
  const [query, setQuery] = useState<DataTableQuery>({ page: 1, pageSize: 20, search: "", sort: [] });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q: DataTableQuery) => {
    setLoading(true);
    try {
      const res = await api.listPatients(q.page, q.pageSize, q.search || undefined);
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
    void load(query);
  }, [query, load]);

  return (
    <>
      <PageHeader title="Patients" description={`${total} registered`} />
      <DataTable
        columns={patientColumns(
          canEdit,
          (p) => router.push(`/patients/${p.id}`),
          (p) => router.push(`/patients/${p.id}?edit=1`),
        )}
        rows={rows}
        rowKey={(p) => p.id}
        loading={loading}
        error={error}
        onRetry={() => void load(query)}
        searchPlaceholder="Search by UHID, name, or phone…"
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
        toolbarActions={
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
