"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  TableActions,
  ToggleAction,
  actionsColumn,
  type Column,
} from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { Branch, Department, Provider } from "@hms/types";
import * as api from "../../../lib/api";
import { RequirePermission, Can } from "../../../components/Can";
import { PageHeader } from "../../../components/PageHeader";
import { useCan } from "../../../lib/auth";

/**
 * Departments (ADR-050) — the hospital's clinical organisation.
 *
 * Departments are **deactivated, never deleted**: visits and encounters reference
 * them, and last year's register must still name the department it happened in.
 * The row action is therefore a toggle, and its confirmation says how many doctors
 * are attached so the effect is visible before it is accepted.
 *
 * Feedback comes from the shared toast raised inside the API client (ADR-026) —
 * this screen keeps no notification state of its own.
 */
function DepartmentsTable() {
  const [rows, setRows] = useState<Department[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = useCan(PERMISSIONS.DEPARTMENT_MANAGE);

  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [branchId, setBranchId] = useState("");
  const [headProviderId, setHeadProviderId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.listDepartments());
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Failed to load departments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The branch and head-of-department pickers offer only this hospital's own records.
  // The server refuses anything else, so the form never presents an invalid choice.
  useEffect(() => {
    if (!canManage) return;
    api.listBranches().then(setBranches).catch(() => {});
    api.listProviders().then(setProviders).catch(() => {});
  }, [canManage]);

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
      await api.createDepartment({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || null,
        branchId: branchId || null,
        headProviderId: headProviderId || null,
      });
      setCode("");
      setName("");
      setDescription("");
      setBranchId("");
      setHeadProviderId("");
      setShowForm(false);
      await load();
    } catch (e) {
      setFormError(e instanceof api.ApiRequestError ? e.message : "Could not create the department.");
    }
  }

  const columns: Array<Column<Department>> = [
    {
      key: "code",
      header: "Code",
      hideable: false,
      accessor: (d) => d.code,
      cell: (d) => <span className="font-medium text-fg">{d.code}</span>,
    },
    { key: "name", header: "Department", accessor: (d) => d.name, cell: (d) => <span className="text-fg">{d.name}</span> },
    {
      key: "branch",
      header: "Branch",
      filterable: true,
      accessor: (d) => d.branchName ?? "Organization-wide",
      cell: (d) => d.branchName ?? <span className="text-fg-subtle">Organization-wide</span>,
    },
    {
      key: "head",
      header: "Head of department",
      accessor: (d) => d.headProviderName ?? "",
      cell: (d) => d.headProviderName ?? <span className="text-fg-subtle">Not assigned</span>,
    },
    { key: "doctors", header: "Doctors", accessor: (d) => d.providerCount, cell: (d) => String(d.providerCount) },
    {
      key: "status",
      header: "Status",
      filterable: true,
      accessor: (d) => (d.isActive ? "active" : "inactive"),
      cell: (d) => <Badge tone={d.isActive ? "success" : "neutral"}>{d.isActive ? "active" : "inactive"}</Badge>,
    },
    actionsColumn<Department>((d) => (
      <TableActions label={`Actions for ${d.name}`}>
        <ToggleAction
          on={d.isActive}
          onLabel="Deactivate department"
          offLabel="Activate department"
          permitted={canManage}
          loading={busy}
          confirm={
            d.isActive
              ? {
                  title: `Deactivate ${d.name}?`,
                  description:
                    d.providerCount > 0
                      ? `${d.providerCount} doctor${d.providerCount === 1 ? " is" : "s are"} assigned to it. Existing visits keep their department; new check-ins can no longer choose it.`
                      : "New check-ins can no longer choose it. Existing visits keep their department.",
                  confirmLabel: "Deactivate",
                }
              : undefined
          }
          onToggle={(next) => void run(() => api.updateDepartment(d.id, { isActive: next }))}
        />
      </TableActions>
    )),
  ];

  return (
    <>
      <PageHeader
        title="Departments"
        description="The clinical departments your hospital runs. Doctors are assigned to them, and check-in routes by them."
        actions={
          <Can perm={PERMISSIONS.DEPARTMENT_MANAGE}>
            <Button onClick={() => setShowForm((v) => !v)}>
              {showForm ? (
                "Close"
              ) : (
                <>
                  <Plus size={16} strokeWidth={2} /> New department
                </>
              )}
            </Button>
          </Can>
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}

      {showForm && (
        <Card header="New department">
          <form className="flex flex-col gap-4" onSubmit={handleCreate}>
            {formError && <Alert tone="danger">{formError}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Code"
                placeholder="ORTHO"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                hint="Short and unique within your hospital. Stored in capitals."
              />
              <Field
                label="Name"
                placeholder="Orthopaedics"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <div className="sm:col-span-2">
                <Field
                  label="Description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  hint="Optional."
                />
              </div>
              <div className="hms-field">
                <label className="hms-label" htmlFor="dept-branch">
                  Branch
                </label>
                <select id="dept-branch" className="hms-input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">Organization-wide</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <span className="hms-field__hint">Leave organization-wide unless only one branch runs it.</span>
              </div>
              <div className="hms-field">
                <label className="hms-label" htmlFor="dept-head">
                  Head of department
                </label>
                <select
                  id="dept-head"
                  className="hms-input"
                  value={headProviderId}
                  onChange={(e) => setHeadProviderId(e.target.value)}
                >
                  <option value="">Not assigned</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </select>
                <span className="hms-field__hint">Optional — can be set later.</span>
              </div>
            </div>
            <div>
              <Button type="submit">Create department</Button>
            </div>
          </form>
        </Card>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(d) => d.id}
        loading={loading}
        error={error}
        emptyMessage="No departments yet. Add the ones patients are seen in — doctors are assigned to them, and check-in routes by them."
      />
    </>
  );
}

export default function DepartmentsPage() {
  return (
    <RequirePermission perm={PERMISSIONS.DEPARTMENT_VIEW}>
      <DepartmentsTable />
    </RequirePermission>
  );
}
