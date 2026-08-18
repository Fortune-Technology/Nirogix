"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Card,
  DateField,
  Dialog,
  Field,
  PhoneField,
} from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import { formatDate, todayApiDate } from "@hms/utils";
import type { CreatePatientRequest, DuplicatePatientCandidate } from "@hms/types";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";
import { PageHeader } from "../../../../components/PageHeader";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

function RegisterForm() {
  const router = useRouter();
  const [f, setF] = useState<CreatePatientRequest>({ firstName: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // The DUPLICATE_PATIENT 409: matching charts to review before anything is created.
  const [duplicates, setDuplicates] = useState<DuplicatePatientCandidate[] | null>(null);

  function set<K extends keyof CreatePatientRequest>(key: K, value: CreatePatientRequest[K]) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  function buildBody(allowDuplicate?: boolean): CreatePatientRequest {
    // Drop empty strings so optional fields validate cleanly.
    const body = Object.fromEntries(
      Object.entries(f).filter(([, v]) => v !== "" && v != null),
    ) as CreatePatientRequest;
    if (allowDuplicate) body.allowDuplicate = true;
    return body;
  }

  async function submit(allowDuplicate?: boolean) {
    setError(null);
    setSubmitting(true);
    try {
      const created = await api.createPatient(buildBody(allowDuplicate));
      router.replace(`/patients/${created.id}`);
    } catch (err) {
      if (err instanceof api.ApiRequestError && err.code === "DUPLICATE_PATIENT") {
        const details = err.details as { candidates?: DuplicatePatientCandidate[] } | undefined;
        setDuplicates(details?.candidates ?? []);
      } else {
        setError(err instanceof api.ApiRequestError ? err.message : "Could not register the patient.");
      }
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await submit();
  }

  return (
    <>
      <PageHeader title="Register patient" description="A UHID is assigned automatically on save." />
      <form className="flex max-w-3xl flex-col gap-5" onSubmit={handleSubmit}>
        {error && <Alert tone="danger">{error}</Alert>}

        <Card header="Identity">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" value={f.firstName} onChange={(e) => set("firstName", e.target.value)} required autoFocus />
            <Field label="Last name" value={f.lastName ?? ""} onChange={(e) => set("lastName", e.target.value)} />
            <label className="hms-field">
              <span className="hms-label">Gender</span>
              <select className="hms-input" value={f.gender ?? ""} onChange={(e) => set("gender", e.target.value)}>
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </label>
            <DateField
              label="Date of birth"
              value={f.dateOfBirth ?? null}
              max={todayApiDate()}
              onChange={(v) => set("dateOfBirth", v ?? "")}
            />
            <label className="hms-field">
              <span className="hms-label">Blood group</span>
              <select className="hms-input" value={f.bloodGroup ?? ""} onChange={(e) => set("bloodGroup", e.target.value)}>
                <option value="">—</option>
                {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <Field label="ABHA number (optional)" value={f.abhaNumber ?? ""} onChange={(e) => set("abhaNumber", e.target.value)} />
          </div>
        </Card>

        <Card header="Contact">
          <div className="grid gap-4 sm:grid-cols-2">
            <PhoneField label="Phone" value={f.phone ?? ""} onChange={(v) => set("phone", v)} />
            <Field label="Email" type="email" value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} />
            <Field label="Address" value={f.addressLine ?? ""} onChange={(e) => set("addressLine", e.target.value)} />
            <Field label="City" value={f.city ?? ""} onChange={(e) => set("city", e.target.value)} />
            <Field label="State" value={f.state ?? ""} onChange={(e) => set("state", e.target.value)} />
            <Field label="PIN code" value={f.pincode ?? ""} onChange={(e) => set("pincode", e.target.value)} />
          </div>
        </Card>

        <Card header="Emergency contact">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" value={f.emergencyContactName ?? ""} onChange={(e) => set("emergencyContactName", e.target.value)} />
            <Field label="Phone" value={f.emergencyContactPhone ?? ""} onChange={(e) => set("emergencyContactPhone", e.target.value)} />
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={submitting}>Register patient</Button>
          <Link href="/patients"><Button variant="ghost" type="button">Cancel</Button></Link>
        </div>
      </form>

      {/* "Search and select, don't re-create": the server found charts matching this
          phone/name/DOB. The default action is using the existing chart; registering a
          duplicate anyway is the deliberate, secondary choice. */}
      <Dialog
        open={duplicates !== null}
        onClose={() => setDuplicates(null)}
        title="This patient may already be registered"
        description="A chart with the same phone and name (or date of birth) already exists. Use it instead of creating a second record."
        size="md"
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setDuplicates(null)}>
              Back to the form
            </Button>
            <Button
              variant="secondary"
              type="button"
              loading={submitting}
              onClick={() => {
                setDuplicates(null);
                void submit(true);
              }}
            >
              Register anyway
            </Button>
          </div>
        }
      >
        <ul className="flex flex-col divide-y divide-border text-sm">
          {(duplicates ?? []).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <span className="font-medium text-fg">{[c.firstName, c.lastName].filter(Boolean).join(" ")}</span>
                <span className="ml-2 font-mono text-xs text-fg-muted">{c.uhid}</span>
                <p className="text-xs text-fg-muted">
                  {c.phone ?? "no phone"} · {c.dateOfBirth ? formatDate(c.dateOfBirth) : "DOB unknown"}
                  {c.gender ? ` · ${c.gender}` : ""}
                </p>
              </div>
              <Link href={`/patients/${c.id}`}>
                <Button size="sm">Use this patient</Button>
              </Link>
            </li>
          ))}
        </ul>
        {(duplicates ?? []).length === 0 && <Badge tone="neutral">No candidate details available</Badge>}
      </Dialog>
    </>
  );
}

export default function NewPatientPage() {
  return (
    <RequirePermission perm={PERMISSIONS.PATIENT_CREATE}>
      <RegisterForm />
    </RequirePermission>
  );
}
