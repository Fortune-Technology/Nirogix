"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge, Button, DataTable, Field, type Column } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { Patient } from "@hms/types";
import * as api from "../../../lib/api";
import { RequirePermission, Can } from "../../../components/Can";
import { PageHeader } from "../../../components/PageHeader";

function age(dob: string | null): string {
  if (!dob) return "—";
  const d = new Date(dob);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a >= 0 ? `${a}y` : "—";
}

const columns: Array<Column<Patient>> = [
  {
    key: "uhid",
    header: "UHID",
    cell: (p) => (
      <Link href={`/patients/${p.id}`} className="font-mono font-medium text-brand hover:underline">
        {p.uhid}
      </Link>
    ),
  },
  {
    key: "name",
    header: "Name",
    cell: (p) => <span className="font-medium text-fg">{[p.firstName, p.lastName].filter(Boolean).join(" ")}</span>,
  },
  { key: "gender", header: "Gender", cell: (p) => p.gender ?? "—" },
  { key: "age", header: "Age", cell: (p) => age(p.dateOfBirth) },
  { key: "phone", header: "Phone", cell: (p) => p.phone ?? "—" },
  { key: "city", header: "City", cell: (p) => p.city ?? "—" },
  {
    key: "status",
    header: "Status",
    cell: (p) => <Badge tone={p.status === "active" ? "success" : "neutral"}>{p.status}</Badge>,
  },
];

function PatientsTable() {
  const [rows, setRows] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: number, term: string) => {
    setLoading(true);
    try {
      const res = await api.listPatients(p, 20, term || undefined);
      setRows(res.data);
      setTotalPages(res.page.totalPages);
      setTotal(res.page.total);
      setError(null);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Failed to load patients.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search; resets to page 1 when the term changes.
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      void load(1, search);
    }, 300);
    return () => clearTimeout(t);
  }, [search, load]);

  useEffect(() => {
    void load(page, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <>
      <PageHeader
        title="Patients"
        description={`${total} registered`}
        actions={
          <Can perm={PERMISSIONS.PATIENT_CREATE}>
            <Link href="/patients/new">
              <Button><Plus size={16} strokeWidth={2} /> Register patient</Button>
            </Link>
          </Can>
        }
      />
      <div className="max-w-md">
        <Field placeholder="Search by UHID, name, or phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        loading={loading}
        error={error}
        emptyMessage={search ? "No patients match your search." : "No patients registered yet."}
      />
      <div className="flex items-center justify-end gap-3">
        <span className="text-sm text-fg-muted">Page {page} of {totalPages}</span>
        <Button variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</Button>
        <Button variant="secondary" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>Next</Button>
      </div>
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
