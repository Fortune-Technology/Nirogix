"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  DateField,
  Field,
  PhoneField,
  Spinner,
} from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import { todayApiDate } from "@hms/utils";
import type { Patient, CreatePatientRequest } from "@hms/types";
import * as api from "../../../../lib/api";
import { RequirePermission, Can } from "../../../../components/Can";
import { PortalAccessCard } from "../../../../components/patients/PortalAccessCard";
import { PatientHistory } from "../../../../components/patients/PatientHistory";
import { ImmunizationsCard } from "../../../../components/patients/ImmunizationsCard";
import { PageHeader } from "../../../../components/PageHeader";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="text-fg">{children || "—"}</dd>
    </div>
  );
}

function Profile({ id }: { id: string }) {
  const [p, setP] = useState<Patient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<CreatePatientRequest> & { status?: string }>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getPatient(id);
      setP(data);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Failed to load patient.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  // The patients-list "Edit details" action lands here with ?edit=1 — open the form as
  // soon as the record is in (once; closing it stays closed).
  const [autoEditDone, setAutoEditDone] = useState(false);
  useEffect(() => {
    if (!p || autoEditDone) return;
    if (new URLSearchParams(window.location.search).get("edit") === "1") {
      setAutoEditDone(true);
      startEdit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, autoEditDone]);

  function startEdit() {
    if (!p) return;
    setForm({
      lastName: p.lastName ?? "", gender: p.gender ?? "", dateOfBirth: p.dateOfBirth ?? "",
      phone: p.phone ?? "", email: p.email ?? "", bloodGroup: p.bloodGroup ?? "",
      addressLine: p.addressLine ?? "", city: p.city ?? "", state: p.state ?? "", pincode: p.pincode ?? "",
      emergencyContactName: p.emergencyContactName ?? "", emergencyContactPhone: p.emergencyContactPhone ?? "",
      status: p.status,
    });
    setEditing(true);
  }

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // Empty strings → null so nullable fields (email, pincode, enums) validate cleanly.
      const patch = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v === "" ? null : v]),
      );
      await api.updatePatient(id, patch);
      setEditing(false);
      await load();
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex items-center gap-2 text-fg-muted"><Spinner /> Loading…</div>;
  if (error && !p) return <Alert tone="danger">{error}</Alert>;
  if (!p) return null;

  return (
    <>
      <PageHeader
        title={[p.firstName, p.lastName].filter(Boolean).join(" ")}
        description={<span className="font-mono">{p.uhid}</span>}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={p.status === "active" ? "success" : "neutral"}>{p.status}</Badge>
            <Link href="/patients"><Button variant="ghost"><ArrowLeft size={16} strokeWidth={2} /> All patients</Button></Link>
            {!editing && (
              <Can perm={PERMISSIONS.PATIENT_UPDATE}>
                <Button variant="secondary" onClick={startEdit}>Edit</Button>
              </Can>
            )}
          </div>
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}

      {editing ? (
        <form className="flex max-w-3xl flex-col gap-5" onSubmit={save}>
          <Card header="Edit patient">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Last name" value={form.lastName ?? ""} onChange={(e) => set("lastName", e.target.value)} />
              <label className="hms-field"><span className="hms-label">Gender</span>
                <select className="hms-input" value={form.gender ?? ""} onChange={(e) => set("gender", e.target.value)}>
                  <option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                </select>
              </label>
              <DateField
                label="Date of birth"
                value={form.dateOfBirth ?? null}
                max={todayApiDate()}
                onChange={(v) => set("dateOfBirth", v ?? "")}
              />
              <label className="hms-field"><span className="hms-label">Blood group</span>
                <select className="hms-input" value={form.bloodGroup ?? ""} onChange={(e) => set("bloodGroup", e.target.value)}>
                  <option value="">—</option>{BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
              <PhoneField label="Phone" value={form.phone ?? ""} onChange={(v) => set("phone", v)} />
              <Field label="Email" type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
              <Field label="Address" value={form.addressLine ?? ""} onChange={(e) => set("addressLine", e.target.value)} />
              <Field label="City" value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
              <Field label="State" value={form.state ?? ""} onChange={(e) => set("state", e.target.value)} />
              <Field label="PIN code" value={form.pincode ?? ""} onChange={(e) => set("pincode", e.target.value)} />
              <Field label="Emergency contact" value={form.emergencyContactName ?? ""} onChange={(e) => set("emergencyContactName", e.target.value)} />
              <Field label="Emergency phone" value={form.emergencyContactPhone ?? ""} onChange={(e) => set("emergencyContactPhone", e.target.value)} />
              <label className="hms-field"><span className="hms-label">Status</span>
                <select className="hms-input" value={form.status ?? "active"} onChange={(e) => set("status", e.target.value)}>
                  <option value="active">active</option><option value="archived">archived</option>
                </select>
              </label>
            </div>
          </Card>
          <div className="flex gap-3">
            <Button type="submit" loading={saving}>Save</Button>
            <Button variant="ghost" type="button" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card header="Identity">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Row label="Gender">{p.gender}</Row>
              <Row label="Date of birth">{p.dateOfBirth}</Row>
              <Row label="Blood group">{p.bloodGroup}</Row>
              <Row label="ABHA number">{p.abhaNumber}</Row>
            </dl>
          </Card>
          <Card header="Contact">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Row label="Phone">{p.phone}</Row>
              <Row label="Email">{p.email}</Row>
              <Row label="Address">{p.addressLine}</Row>
              <Row label="City">{p.city}</Row>
              <Row label="State">{p.state}</Row>
              <Row label="PIN code">{p.pincode}</Row>
            </dl>
          </Card>
          <Card header="Emergency contact">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Row label="Name">{p.emergencyContactName}</Row>
              <Row label="Phone">{p.emergencyContactPhone}</Row>
            </dl>
          </Card>
          <PortalAccessCard patient={p} />
        </div>
      )}

      {/* The record's story across visits — what "maintain patient history" means in the UI.
          Each block is permission-gated, so a receptionist sees visits and bills while the
          clinical history stays with EMR-permitted roles. */}
      {!editing && (
        <Can perm={PERMISSIONS.IMMUNIZATION_VIEW}>
          <ImmunizationsCard patientId={p.id} />
        </Can>
      )}
      {!editing && <PatientHistory patientId={p.id} />}
    </>
  );
}

export default function PatientProfilePage() {
  const params = useParams<{ id: string }>();
  return (
    <RequirePermission perm={PERMISSIONS.PATIENT_VIEW}>
      <Profile id={params.id} />
    </RequirePermission>
  );
}
