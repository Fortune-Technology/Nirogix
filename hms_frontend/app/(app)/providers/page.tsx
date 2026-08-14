"use client";

import { useEffect, useState } from "react";
import { Badge, DataTable, type Column } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { Provider } from "@hms/types";
import * as api from "../../../lib/api";
import { RequirePermission } from "../../../components/Can";
import { PageHeader } from "../../../components/PageHeader";

const columns: Array<Column<Provider>> = [
  { key: "name", header: "Name", cell: (p) => <span className="font-medium text-fg">{p.fullName}</span> },
  { key: "reg", header: "Registration", cell: (p) => p.registrationNumber ?? "—" },
  { key: "qual", header: "Qualification", cell: (p) => p.qualification ?? "—" },
  {
    key: "specialties",
    header: "Specialties",
    cell: (p) =>
      p.specialties.length ? (
        <div className="flex flex-wrap gap-1">
          {p.specialties.map((s) => (
            <Badge key={s} tone="brand">
              {s.replace(/_/g, " ")}
            </Badge>
          ))}
        </div>
      ) : (
        "—"
      ),
  },
  {
    key: "status",
    header: "Status",
    cell: (p) => (p.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Inactive</Badge>),
  },
];

function ProvidersTable() {
  const [rows, setRows] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .listProviders()
      .then((data) => alive && setRows(data))
      .catch((err) => alive && setError(err instanceof api.ApiRequestError ? err.message : "Failed to load providers."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <PageHeader
        title="Providers"
        description="Practitioners and their specialties (FHIR Practitioner / PractitionerRole)."
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        loading={loading}
        error={error}
        emptyMessage="No providers yet."
      />
    </>
  );
}

export default function ProvidersPage() {
  return (
    <RequirePermission perm={PERMISSIONS.PROVIDER_VIEW}>
      <ProvidersTable />
    </RequirePermission>
  );
}
