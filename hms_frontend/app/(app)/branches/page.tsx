"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  DataTable,
  TableActions,
  ToggleAction,
  actionsColumn,
  type Column,
} from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { Branch } from "@hms/types";
import * as api from "../../../lib/api";
import { RequirePermission, Can } from "../../../components/Can";
import { PageHeader } from "../../../components/PageHeader";
import { useCan } from "../../../lib/auth";

function BranchesTable() {
  const [rows, setRows] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = useCan(PERMISSIONS.BRANCHES_MANAGE);

  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.listBranches());
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Failed to load branches.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await api.createBranch({ code: code.trim().toUpperCase(), name: name.trim() });
      setCode("");
      setName("");
      setShowForm(false);
      await load();
    } catch (e) {
      setFormError(e instanceof api.ApiRequestError ? e.message : "Could not create branch.");
    }
  }

  const columns: Array<Column<Branch>> = [
    { key: "code", header: "Code", hideable: false, accessor: (b) => b.code, cell: (b) => <span className="font-medium text-fg">{b.code}</span> },
    { key: "name", header: "Name", accessor: (b) => b.name, cell: (b) => <span className="text-fg">{b.name}</span> },
    {
      key: "status",
      header: "Status",
      filterable: true,
      accessor: (b) => (b.isActive ? "active" : "inactive"),
      cell: (b) => <Badge tone={b.isActive ? "success" : "neutral"}>{b.isActive ? "active" : "inactive"}</Badge>,
    },
    actionsColumn<Branch>((b) => (
      <TableActions label={`Actions for ${b.name}`}>
        <ToggleAction
          on={b.isActive}
          onLabel="Deactivate branch"
          offLabel="Activate branch"
          permitted={canManage}
          loading={busy}
          confirm={
            b.isActive
              ? {
                  title: `Deactivate ${b.name}?`,
                  description: "Staff will no longer be able to work in this branch until it is activated again.",
                  confirmLabel: "Deactivate",
                }
              : undefined
          }
          onToggle={(next) => void run(() => api.updateBranch(b.id, { isActive: next }))}
        />
      </TableActions>
    )),
  ];

  return (
    <>
      <PageHeader
        title="Branches"
        description="Your organization's locations."
        actions={
          <Can perm={PERMISSIONS.BRANCHES_MANAGE}>
            <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Close" : <><Plus size={16} strokeWidth={2} /> New branch</>}</Button>
          </Can>
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}

      {showForm && (
        <Card header="New branch">
          <form className="flex flex-col gap-4" onSubmit={handleCreate}>
            {formError && <Alert tone="danger">{formError}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Code" placeholder="HQ" value={code} onChange={(e) => setCode(e.target.value)} required />
              <Field label="Name" placeholder="Head Office" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Button type="submit">Create branch</Button>
            </div>
          </form>
        </Card>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(b) => b.id}
        loading={loading}
        error={error}
        emptyMessage="No branches."
      />
    </>
  );
}

export default function BranchesPage() {
  return (
    <RequirePermission perm={PERMISSIONS.BRANCHES_VIEW}>
      <BranchesTable />
    </RequirePermission>
  );
}
