"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, Stethoscope } from "lucide-react";
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  EditAction,
  Field,
  PhoneField,
  TableAction,
  TableActions,
  ToggleAction,
  actionsColumn,
  type Column,
} from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { Provider, Specialty, Department, UserListItem } from "@hms/types";
import * as api from "../../../lib/api";
import { RequirePermission, Can } from "../../../components/Can";
import { PageHeader } from "../../../components/PageHeader";
import { useCan } from "../../../lib/auth";

type ProviderForm = {
  fullName: string;
  gender: string;
  registrationNumber: string;
  qualification: string;
  email: string;
  phone: string;
  userId: string;
  feeRupees: string;
  /** Create only — the first specialty; more are assigned from the row action. */
  specialtyCode: string;
  departmentId: string;
};

const EMPTY_FORM: ProviderForm = {
  fullName: "",
  gender: "",
  registrationNumber: "",
  qualification: "",
  email: "",
  phone: "",
  userId: "",
  feeRupees: "",
  specialtyCode: "",
  departmentId: "",
};

function feeToPaise(feeRupees: string): number | null | undefined {
  if (feeRupees.trim() === "") return null;
  const n = Number(feeRupees);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined; // undefined = invalid
}

function ProvidersTable() {
  const canManage = useCan(PERMISSIONS.PROVIDER_MANAGE);
  const [rows, setRows] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  // Users load only for role holders who may link logins; a 403 just hides the field.
  const [users, setUsers] = useState<UserListItem[]>([]);

  // One dialog for create and edit; `editing` decides which.
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [savingForm, setSavingForm] = useState(false);

  // Assign-specialty dialog.
  const [specialtyFor, setSpecialtyFor] = useState<Provider | null>(null);
  const [specialtyCode, setSpecialtyCode] = useState("");
  const [specialtyDept, setSpecialtyDept] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listProviders());
      setError(null);
    } catch (err) {
      setError(err instanceof api.ApiRequestError ? err.message : "Failed to load providers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canManage) return;
    api.listSpecialties().then(setSpecialties).catch(() => setSpecialties([]));
    api.listDepartments({ activeOnly: true }).then(setDepartments).catch(() => setDepartments([]));
    api.listUsers().then(setUsers).catch(() => setUsers([]));
  }, [canManage]);

  function startCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setOpen(true);
  }

  function startEdit(p: Provider) {
    setEditing(p);
    setForm({
      fullName: p.fullName,
      gender: p.gender ?? "",
      registrationNumber: p.registrationNumber ?? "",
      qualification: p.qualification ?? "",
      email: p.email ?? "",
      phone: p.phone ?? "",
      userId: p.userId ?? "",
      feeRupees: p.consultationFeePaise != null ? String(p.consultationFeePaise / 100) : "",
      specialtyCode: "",
      departmentId: "",
    });
    setFormError(null);
    setOpen(true);
  }

  function set<K extends keyof ProviderForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.fullName.trim()) {
      setFormError("The doctor's name is required.");
      return;
    }
    const feePaise = feeToPaise(form.feeRupees);
    if (feePaise === undefined) {
      setFormError("Enter a valid consultation fee.");
      return;
    }
    setSavingForm(true);
    try {
      if (editing) {
        await api.updateProvider(editing.id, {
          fullName: form.fullName.trim(),
          gender: form.gender || null,
          registrationNumber: form.registrationNumber || null,
          qualification: form.qualification || null,
          email: form.email || null,
          phone: form.phone || null,
          userId: form.userId || null,
          consultationFeePaise: feePaise,
        });
      } else {
        const created = await api.createProvider({
          fullName: form.fullName.trim(),
          gender: form.gender || undefined,
          registrationNumber: form.registrationNumber || undefined,
          qualification: form.qualification || undefined,
          email: form.email || undefined,
          phone: form.phone || undefined,
          userId: form.userId || undefined,
          consultationFeePaise: feePaise,
        });
        if (form.specialtyCode) {
          await api.assignProviderSpecialty(created.id, {
            specialtyCode: form.specialtyCode,
            departmentId: form.departmentId || undefined,
            isPrimary: true,
          });
        }
      }
      setOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof api.ApiRequestError ? err.message : "Could not save the doctor.");
    } finally {
      setSavingForm(false);
    }
  }

  async function submitSpecialty(e: FormEvent) {
    e.preventDefault();
    if (!specialtyFor || !specialtyCode) return;
    setSavingForm(true);
    try {
      await api.assignProviderSpecialty(specialtyFor.id, {
        specialtyCode,
        departmentId: specialtyDept || undefined,
      });
      setSpecialtyFor(null);
      await load();
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setSavingForm(false);
    }
  }

  async function toggleActive(p: Provider) {
    try {
      await api.updateProvider(p.id, { isActive: !p.isActive });
      await load();
    } catch {
      /* reported by the shared API-feedback layer */
    }
  }

  const columns: Array<Column<Provider>> = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      hideable: false,
      accessor: (p) => p.fullName,
      cell: (p) => <span className="font-medium text-fg">{p.fullName}</span>,
    },
    { key: "reg", header: "Registration", accessor: (p) => p.registrationNumber, cell: (p) => p.registrationNumber ?? "—" },
    { key: "qual", header: "Qualification", accessor: (p) => p.qualification, cell: (p) => p.qualification ?? "—" },
    {
      key: "specialties",
      header: "Specialties",
      filterable: true,
      accessor: (p) => p.specialties.map((s) => s.replace(/_/g, " ")).join(", ") || "—",
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
      key: "fee",
      header: "Consultation fee",
      accessor: (p) => p.consultationFeePaise,
      cell: (p) => (p.consultationFeePaise != null ? `₹${p.consultationFeePaise / 100}` : "—"),
    },
    {
      key: "status",
      header: "Status",
      filterable: true,
      accessor: (p) => (p.isActive ? "Active" : "Inactive"),
      cell: (p) => (p.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Inactive</Badge>),
    },
    actionsColumn<Provider>((p) => (
      <TableActions label={`Actions for ${p.fullName}`}>
        <EditAction label="Edit doctor" permitted={canManage} onSelect={() => startEdit(p)} />
        <TableAction
          label="Assign specialty"
          icon={<Stethoscope size={16} strokeWidth={2} aria-hidden />}
          permitted={canManage}
          onSelect={() => {
            setSpecialtyFor(p);
            setSpecialtyCode("");
            setSpecialtyDept("");
          }}
        />
        {/* Deactivate, never delete — the doctor's name is on encounters and prescriptions. */}
        <ToggleAction
          on={p.isActive}
          permitted={canManage}
          onLabel="Deactivate doctor"
          offLabel="Reactivate doctor"
          confirm={{
            title: `Deactivate ${p.fullName}?`,
            description:
              "Past consultations and records keep their author. The doctor stops appearing for new check-ins and appointments until reactivated.",
            confirmLabel: "Deactivate",
          }}
          onToggle={() => void toggleActive(p)}
        />
      </TableActions>
    )),
  ];

  const formFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name" required value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
      <Field label="Qualification" value={form.qualification} onChange={(e) => set("qualification", e.target.value)} placeholder="MBBS, MD" />
      <Field label="Registration no." value={form.registrationNumber} onChange={(e) => set("registrationNumber", e.target.value)} placeholder="MMC-…" />
      <label className="hms-field">
        <span className="hms-label">Gender</span>
        <select className="hms-input" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
          <option value="">—</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </select>
      </label>
      <Field label="Email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
      <PhoneField label="Phone" value={form.phone} onChange={(v) => set("phone", v)} />
      <Field
        label="Consultation fee (₹)"
        type="number"
        min={0}
        step="0.01"
        value={form.feeRupees}
        onChange={(e) => set("feeRupees", e.target.value)}
        placeholder="500"
      />
      {users.length > 0 && (
        <label className="hms-field">
          <span className="hms-label">Login account (for their own queue)</span>
          <select className="hms-input" value={form.userId} onChange={(e) => set("userId", e.target.value)}>
            <option value="">Not linked</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName} — {u.email}
              </option>
            ))}
          </select>
        </label>
      )}
      {!editing && (
        <>
          <label className="hms-field">
            <span className="hms-label">Specialty</span>
            <select className="hms-input" value={form.specialtyCode} onChange={(e) => set("specialtyCode", e.target.value)}>
              <option value="">Assign later</option>
              {specialties.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="hms-field">
            <span className="hms-label">Department</span>
            <select
              className="hms-input"
              value={form.departmentId}
              disabled={!form.specialtyCode}
              onChange={(e) => set("departmentId", e.target.value)}
            >
              <option value="">Not specified</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Providers"
        description="Practitioners and their specialties (FHIR Practitioner / PractitionerRole)."
        actions={
          <Can perm={PERMISSIONS.PROVIDER_MANAGE}>
            <Button onClick={startCreate}>
              <Plus size={16} strokeWidth={2} /> Add doctor
            </Button>
          </Can>
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        emptyMessage="No providers yet."
        emptyDescription="Add the hospital's doctors so appointments and check-ins can be assigned."
        emptyAction={
          <Can perm={PERMISSIONS.PROVIDER_MANAGE}>
            <Button size="sm" onClick={startCreate}>
              <Plus size={16} strokeWidth={2} /> Add doctor
            </Button>
          </Can>
        }
        searchPlaceholder="Search providers…"
        pagination={{ pageSize: 20 }}
      />

      <Dialog
        open={open}
        onClose={() => !savingForm && setOpen(false)}
        title={editing ? `Edit ${editing.fullName}` : "Add doctor"}
        description={editing ? undefined : "Creates the practitioner record used by appointments, check-in and consultations."}
        size="lg"
        busy={savingForm}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" type="button" disabled={savingForm} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="provider-form" loading={savingForm}>
              {editing ? "Save changes" : "Add doctor"}
            </Button>
          </div>
        }
      >
        <form id="provider-form" onSubmit={submitForm} className="flex flex-col gap-4">
          {formError && <p className="text-sm text-danger">{formError}</p>}
          {formFields}
        </form>
      </Dialog>

      <Dialog
        open={specialtyFor !== null}
        onClose={() => !savingForm && setSpecialtyFor(null)}
        title={specialtyFor ? `Assign specialty — ${specialtyFor.fullName}` : "Assign specialty"}
        size="md"
        busy={savingForm}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" type="button" disabled={savingForm} onClick={() => setSpecialtyFor(null)}>
              Cancel
            </Button>
            <Button type="submit" form="specialty-form" loading={savingForm} disabled={!specialtyCode}>
              Assign
            </Button>
          </div>
        }
      >
        <form id="specialty-form" onSubmit={submitSpecialty} className="grid gap-4 sm:grid-cols-2">
          <label className="hms-field">
            <span className="hms-label">Specialty</span>
            <select className="hms-input" value={specialtyCode} onChange={(e) => setSpecialtyCode(e.target.value)}>
              <option value="">Choose…</option>
              {specialties.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="hms-field">
            <span className="hms-label">Department</span>
            <select className="hms-input" value={specialtyDept} onChange={(e) => setSpecialtyDept(e.target.value)}>
              <option value="">Not specified</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </form>
      </Dialog>
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
