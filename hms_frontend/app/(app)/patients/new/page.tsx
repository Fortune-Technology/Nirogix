"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  DateField,
  Field,
} from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import { todayApiDate } from "@hms/utils";
import type { CreatePatientRequest } from "@hms/types";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";
import { PageHeader } from "../../../../components/PageHeader";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

function RegisterForm() {
  const router = useRouter();
  const [f, setF] = useState<CreatePatientRequest>({ firstName: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof CreatePatientRequest>(key: K, value: CreatePatientRequest[K]) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // Drop empty strings so optional fields validate cleanly.
      const body = Object.fromEntries(
        Object.entries(f).filter(([, v]) => v !== "" && v != null),
      ) as CreatePatientRequest;
      const created = await api.createPatient(body);
      router.replace(`/patients/${created.id}`);
    } catch (err) {
      setError(err instanceof api.ApiRequestError ? err.message : "Could not register the patient.");
      setSubmitting(false);
    }
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
            <Field label="Phone" value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
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
