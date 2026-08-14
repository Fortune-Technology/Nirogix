"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Badge, Button, Card, Field } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { Patient, Provider } from "@hms/types";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";
import { PageHeader } from "../../../../components/PageHeader";
import { rupeesToPaise } from "../../../../lib/money";

function CheckInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [providerId, setProviderId] = useState("");
  const [feeRupees, setFeeRupees] = useState("500");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const appointmentId = params.get("appointmentId");

  useEffect(() => {
    api.listProviders().then(setProviders).catch(() => setProviders([]));
    const pid = params.get("patientId");
    if (pid) api.getPatient(pid).then(setPatient).catch(() => {});
    const prov = params.get("providerId");
    if (prov) setProviderId(prov);
  }, [params]);

  useEffect(() => {
    if (!search.trim() || patient) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      api.listPatients(1, 6, search).then((r) => setResults(r.data)).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [search, patient]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!patient) {
      setError("Select a patient.");
      return;
    }
    const fee = Number(feeRupees);
    if (!Number.isFinite(fee) || fee < 0) {
      setError("Enter a valid consultation fee.");
      return;
    }
    setSubmitting(true);
    try {
      await api.checkIn({
        patientId: patient.id,
        appointmentId: appointmentId ?? undefined,
        providerId: providerId || undefined,
        reason: reason || undefined,
        consultationFeePaise: rupeesToPaise(fee),
      });
      router.replace("/opd");
    } catch (err) {
      setError(err instanceof api.ApiRequestError ? err.message : "Could not check the patient in.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Check in"
        description="Creates a visit (queue token) and opens a consultation-fee invoice."
      />
      <form className="flex max-w-2xl flex-col gap-5" onSubmit={handleSubmit}>
        {error && <Alert tone="danger">{error}</Alert>}
        {appointmentId && <Alert tone="neutral">Checking in against a booked appointment.</Alert>}

        <Card header="Patient">
          {patient ? (
            <div className="flex items-center gap-3">
              <Badge tone="brand">{patient.uhid}</Badge>
              <span className="text-fg">{[patient.firstName, patient.lastName].filter(Boolean).join(" ")}</span>
              {!appointmentId && (
                <Button variant="ghost" size="sm" type="button" onClick={() => { setPatient(null); setSearch(""); }}>
                  Change
                </Button>
              )}
            </div>
          ) : (
            <div className="relative">
              <Field
                placeholder="Search patient by UHID, name, or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {results.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 rounded-token border border-border bg-surface p-1">
                  {results.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-token px-3 py-2 text-left text-sm hover:bg-surface-2"
                        onClick={() => { setPatient(p); setResults([]); }}
                      >
                        <span className="font-mono text-xs text-fg-muted">{p.uhid}</span>
                        <span className="text-fg">{[p.firstName, p.lastName].filter(Boolean).join(" ")}</span>
                        {p.phone && <span className="ml-auto text-xs text-fg-subtle">{p.phone}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>

        <Card header="Visit">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="hms-field">
              <span className="hms-label">Provider (optional)</span>
              <select className="hms-input" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
                <option value="">Assign later</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.fullName}</option>
                ))}
              </select>
            </label>
            <Field
              label="Consultation fee (₹)"
              type="number"
              min={0}
              step="0.01"
              value={feeRupees}
              onChange={(e) => setFeeRupees(e.target.value)}
            />
            <Field label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={submitting}>Check in</Button>
          <Link href="/opd"><Button variant="ghost" type="button">Cancel</Button></Link>
        </div>
      </form>
    </>
  );
}

export default function CheckInPage() {
  return (
    <RequirePermission perm={PERMISSIONS.OPD_CHECKIN}>
      <Suspense fallback={null}>
        <CheckInForm />
      </Suspense>
    </RequirePermission>
  );
}
