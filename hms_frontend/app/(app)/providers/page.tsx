"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CalendarClock, Plus, Stethoscope, X } from "lucide-react";
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
import type { Provider, ScheduleWindow, Specialty, Department, UserListItem } from "@hms/types";
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

/** A `ScheduleWindow` while it is being edited — slot minutes stay text until save. */
type ScheduleRow = {
  id: string | undefined;
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes: string;
  branchId: string | null | undefined;
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** Wall-clock `HH:mm`, 24-hour — a roster time is a string, never a Date (ADR-048). */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const SCHEDULE_GRID = "grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2.25rem] items-center gap-2";

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

  // Weekly-schedule dialog (ADR-069).
  const [scheduleFor, setScheduleFor] = useState<Provider | null>(null);
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  // False until the roster loads — saving before then could wipe windows we never saw.
  const [scheduleReady, setScheduleReady] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);

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

  function openSchedule(p: Provider) {
    setScheduleFor(p);
    setScheduleRows([]);
    setScheduleError(null);
    setScheduleReady(false);
    setScheduleLoading(true);
    api
      .listProviderSchedules(p.id)
      .then((ws) => {
        setScheduleRows(
          ws.map((w) => ({
            id: w.id,
            weekday: w.weekday,
            startTime: w.startTime,
            endTime: w.endTime,
            slotMinutes: String(w.slotMinutes ?? 15),
            branchId: w.branchId,
          })),
        );
        setScheduleReady(true);
      })
      .catch((err) => {
        setScheduleError(err instanceof api.ApiRequestError ? err.message : "Could not load the schedule.");
      })
      .finally(() => setScheduleLoading(false));
  }

  function setScheduleRow(index: number, patch: Partial<ScheduleRow>) {
    setScheduleRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function submitSchedule(e: FormEvent) {
    e.preventDefault();
    if (!scheduleFor || !scheduleReady) return;
    setScheduleError(null);

    const windows: ScheduleWindow[] = [];
    for (let i = 0; i < scheduleRows.length; i++) {
      const row = scheduleRows[i];
      const startTime = row.startTime.trim();
      const endTime = row.endTime.trim();
      if (!HHMM.test(startTime) || !HHMM.test(endTime)) {
        setScheduleError(`Window ${i + 1}: times must be 24-hour HH:mm — e.g. 09:00 or 17:30.`);
        return;
      }
      // Zero-padded HH:mm compares correctly as a string.
      if (endTime <= startTime) {
        setScheduleError(`Window ${i + 1}: the end time must be after the start time.`);
        return;
      }
      const slotMinutes = row.slotMinutes.trim() === "" ? 15 : Number(row.slotMinutes);
      if (!Number.isInteger(slotMinutes) || slotMinutes < 1) {
        setScheduleError(`Window ${i + 1}: slot minutes must be a whole number of minutes.`);
        return;
      }
      const win: ScheduleWindow = { weekday: row.weekday, startTime, endTime, slotMinutes };
      if (row.id) win.id = row.id;
      if (row.branchId !== undefined) win.branchId = row.branchId;
      windows.push(win);
    }

    setSavingSchedule(true);
    try {
      await api.setProviderSchedules(scheduleFor.id, windows);
      setScheduleFor(null);
    } catch (err) {
      setScheduleError(err instanceof api.ApiRequestError ? err.message : "Could not save the schedule.");
    } finally {
      setSavingSchedule(false);
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
        <TableAction
          label="Weekly schedule"
          icon={<CalendarClock size={16} strokeWidth={2} aria-hidden />}
          permitted={canManage}
          onSelect={() => openSchedule(p)}
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

      <Dialog
        open={scheduleFor !== null}
        onClose={() => !savingSchedule && setScheduleFor(null)}
        title={scheduleFor ? `Weekly schedule — ${scheduleFor.fullName}` : "Weekly schedule"}
        description="No windows = free-form booking; with windows, appointments must fall inside them."
        size="lg"
        busy={savingSchedule}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" type="button" disabled={savingSchedule} onClick={() => setScheduleFor(null)}>
              Cancel
            </Button>
            <Button type="submit" form="schedule-form" loading={savingSchedule} disabled={!scheduleReady}>
              Save schedule
            </Button>
          </div>
        }
      >
        <form id="schedule-form" onSubmit={submitSchedule} className="flex flex-col gap-4">
          {scheduleError && <p className="text-sm text-danger">{scheduleError}</p>}
          {scheduleLoading ? (
            <p className="text-sm text-fg-muted">Loading schedule…</p>
          ) : (
            <>
              {scheduleRows.length === 0 ? (
                <p className="text-sm text-fg-muted">
                  No windows yet — this doctor can be booked at any time. Add a window to limit bookings to roster
                  hours.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className={`${SCHEDULE_GRID} text-xs font-medium text-fg-muted`} aria-hidden>
                    <span>Weekday</span>
                    <span>Start</span>
                    <span>End</span>
                    <span>Slot (min)</span>
                    <span />
                  </div>
                  {scheduleRows.map((row, i) => (
                    <div key={row.id ?? `new-${i}`} className={SCHEDULE_GRID}>
                      <select
                        className="hms-input"
                        aria-label={`Window ${i + 1} weekday`}
                        value={row.weekday}
                        onChange={(e) => setScheduleRow(i, { weekday: Number(e.target.value) })}
                      >
                        {WEEKDAYS.map((day, weekday) => (
                          <option key={day} value={weekday}>
                            {day}
                          </option>
                        ))}
                      </select>
                      <input
                        className="hms-input"
                        aria-label={`Window ${i + 1} start time (HH:mm)`}
                        value={row.startTime}
                        placeholder="09:00"
                        autoComplete="off"
                        onChange={(e) => setScheduleRow(i, { startTime: e.target.value })}
                      />
                      <input
                        className="hms-input"
                        aria-label={`Window ${i + 1} end time (HH:mm)`}
                        value={row.endTime}
                        placeholder="17:00"
                        autoComplete="off"
                        onChange={(e) => setScheduleRow(i, { endTime: e.target.value })}
                      />
                      <input
                        className="hms-input"
                        type="number"
                        min={1}
                        step={5}
                        aria-label={`Window ${i + 1} slot minutes`}
                        value={row.slotMinutes}
                        placeholder="15"
                        onChange={(e) => setScheduleRow(i, { slotMinutes: e.target.value })}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        aria-label={`Remove window ${i + 1}`}
                        className="px-2"
                        onClick={() => setScheduleRows((rows) => rows.filter((_, idx) => idx !== i))}
                      >
                        <X size={16} strokeWidth={2} aria-hidden />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  disabled={!scheduleReady}
                  onClick={() =>
                    setScheduleRows((rows) => [
                      ...rows,
                      { id: undefined, weekday: 1, startTime: "09:00", endTime: "17:00", slotMinutes: "15", branchId: undefined },
                    ])
                  }
                >
                  <Plus size={16} strokeWidth={2} /> Add window
                </Button>
                <p className="text-xs text-fg-subtle">Times are 24-hour HH:mm — 09:00, 13:30, 17:45.</p>
              </div>
            </>
          )}
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
