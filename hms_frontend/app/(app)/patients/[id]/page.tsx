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
  DateDisplay,
  DateField,
  emptyLabel,
  Field,
  PhoneField,
  Spinner,
  ValueOrEmpty,
} from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import { ageInYears, todayApiDate } from "@hms/utils";
import type { Patient, CreatePatientRequest } from "@hms/types";
import * as api from "../../../../lib/api";
import { RequirePermission, Can } from "../../../../components/Can";
import { PortalAccessCard } from "../../../../components/patients/PortalAccessCard";
import { PatientHistory } from "../../../../components/patients/PatientHistory";
import { ImmunizationsCard } from "../../../../components/patients/ImmunizationsCard";
import { CasesCard } from "../../../../components/patients/CasesCard";
import { ExternalHistoryCard } from "../../../../components/patients/ExternalHistoryCard";
import { PageHeader } from "../../../../components/PageHeader";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

/**
 * The identity strip — who this is, answered before anything else (ADR-127).
 *
 * The old page put name and UHID in the header and then made the reader hunt through a two-column
 * card grid for age, gender and blood group. Those are the five things a member of staff checks
 * against the person standing in front of them, so they are one line at the top, and blood group
 * sits with them rather than three rows down a card called "Identity" — it is a clinical fact, not
 * a demographic one.
 *
 * Initials rather than a photograph: the product stores no patient photo, and a silhouette
 * placeholder would imply one is missing rather than never collected.
 */
function IdentityStrip({ p }: { p: Patient }) {
  const name = [p.firstName, p.lastName].filter(Boolean).join(" ");
  const initials = [p.firstName, p.lastName]
    .filter(Boolean)
    .map((part) => part!.trim()[0]?.toUpperCase() ?? "")
    .join("");
  const years = ageInYears(p.dateOfBirth);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <span
          aria-hidden
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand-subtle text-lg font-semibold text-brand"
        >
          {initials || "?"}
        </span>

        <div className="min-w-0">
          <p className="text-lg font-semibold text-fg">{name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
            <span className="font-mono text-fg">{p.uhid}</span>
            <span>{years === null ? emptyLabel("notRecorded") : `${years} years`}</span>
            <ValueOrEmpty value={p.gender} reason="unspecified" />
            <span className="inline-flex items-center gap-1">
              <DateDisplay value={p.dateOfBirth} />
            </span>
          </p>
        </div>

        <span className="flex-1" />

        <div className="flex flex-wrap items-center gap-2">
          {/* Blood group reads as a clinical fact, so it is a badge rather than a table row — and
              its absence is stated, because "we do not know" is the thing worth knowing. */}
          {p.bloodGroup ? (
            <Badge tone="danger">Blood group {p.bloodGroup}</Badge>
          ) : (
            <Badge tone="neutral">Blood group not recorded</Badge>
          )}
          <Badge tone={p.status === "active" ? "success" : "neutral"}>{p.status}</Badge>
        </div>
      </div>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-fg-muted">{label}</dt>
      {/* `break-words`: an email or a long address has no space to break at, and on a phone it
          ran past the edge of its card. */}
      <dd className="break-words text-fg">
        <ValueOrEmpty value={children} reason="unspecified" />
      </dd>
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

      {!editing && <IdentityStrip p={p} />}

      {editing ? (
        <form className="flex max-w-3xl flex-col gap-5" onSubmit={save}>
          <Card header="Edit patient">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Last name" value={form.lastName ?? ""} onChange={(e) => set("lastName", e.target.value)} />
              <label className="hms-field"><span className="hms-label">Gender</span>
                <select className="hms-input" value={form.gender ?? ""} onChange={(e) => set("gender", e.target.value)}>
                  <option value="">Not specified</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
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
                  <option value="">Not recorded</option>{BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
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
        <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-2">
          {/* Contact first of the cards: after "who is this", the next question at a desk is
              always "how do we reach them". */}
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
          {/* National identifiers, not demographics. They belong on the chart and they are not
              what anybody opens it for, so they sit below the details that are. */}
          <Card header="National health ID (ABDM)">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Row label="ABHA number">
                {p.abhaNumber && (
                  <span className="flex flex-wrap items-center gap-2">
                    {p.abhaNumber}
                    {/* A typed ABHA number and one proved with ABDM are not the same thing
                        (ADR-084). Only a completed verification sets `abhaVerifiedAt`, and
                        editing the number by hand clears it — so this badge is the difference,
                        and its absence is information rather than an omission. */}
                    {p.abhaVerifiedAt ? (
                      <Badge tone="success">Verified with ABDM</Badge>
                    ) : (
                      <Badge tone="neutral">Not verified</Badge>
                    )}
                  </span>
                )}
              </Row>
              <Row label="ABHA address">{p.abhaAddress}</Row>
            </dl>
          </Card>
        </div>
      )}

      {/* Ongoing care before past care. What this patient is being treated for right now is the
          question a clinician opens the chart with; the archive of everything that ever happened
          is the answer to a different, rarer one.

          Cases carry their OWN permission. They were gated on `clinical.immunization.view` here,
          which meant a role permitted to manage treatment cases but not immunisations saw neither
          — a mismatch between the key the screen checked and the key the API enforces (ADR-127). */}
      {!editing && (
        <Can perm={PERMISSIONS.CASE_VIEW}>
          <CasesCard patientId={p.id} />
        </Can>
      )}
      {!editing && (
        <Can perm={PERMISSIONS.IMMUNIZATION_VIEW}>
          <ImmunizationsCard patientId={p.id} />
        </Can>
      )}

      {/* Then the record's story across visits — visits, consultations, bills, lab orders and
          documents. Each block is permission-gated, so a receptionist sees visits and bills while
          the clinical history stays with EMR-permitted roles. */}
      {!editing && <PatientHistory patientId={p.id} />}

      {/* Records from OTHER hospitals, held on loan under the patient's consent (ADR-092…094).
          After our own history, not before it: it is the rarer question, and keeping the two
          apart is what stops a borrowed record — which disappears when consent lapses — being
          read as ours. */}
      {!editing && <ExternalHistoryCard patient={p} />}

      {/* Administrative, and last. Whether this patient can sign in to the patient portal is a
          desk task, not a clinical fact, and it was sharing the top row with their phone number. */}
      {!editing && <PortalAccessCard patient={p} />}
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
