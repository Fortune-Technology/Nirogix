"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Card,
  DateField,
  DateTimeField,
  Field,
} from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import { toApiDate, todayApiDate } from "@hms/utils";
import type { FreeSlots, Patient, Provider } from "@hms/types";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";
import { PageHeader } from "../../../../components/PageHeader";

function BookForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [providerId, setProviderId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  // Roster slots (ADR-069): the date being looked up, the provider's free slots on
  // it, and the slot the user picked. `slots === null` means "no roster known" —
  // the free-form date & time entry stays.
  const [slotDate, setSlotDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<FreeSlots | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [duration, setDuration] = useState(15);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const hasRoster = slots?.hasRoster === true;

  useEffect(() => {
    api.listProviders().then(setProviders).catch(() => setProviders([]));
    // Pre-select a patient if arriving from a patient profile (?patientId=).
    const pid = params.get("patientId");
    if (pid) api.getPatient(pid).then(setPatient).catch(() => {});
  }, [params]);

  // Debounced patient search.
  useEffect(() => {
    if (!search.trim() || patient) { setResults([]); return; }
    const t = setTimeout(() => {
      api.listPatients(1, 6, search).then((r) => setResults(r.data)).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [search, patient]);

  // Refresh the provider's free slots whenever provider or date changes.
  useEffect(() => {
    setSelectedSlot("");
    if (!providerId || !slotDate) {
      setSlots(null);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    api
      .listProviderSlots(providerId, slotDate)
      .then((s) => { if (!cancelled) setSlots(s); })
      // Fall back to free-form entry; the server enforces the windows regardless.
      .catch(() => { if (!cancelled) setSlots(null); })
      .finally(() => { if (!cancelled) setSlotsLoading(false); });
    return () => { cancelled = true; };
  }, [providerId, slotDate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!patient) { setError("Select a patient."); return; }
    if (!providerId) { setError("Select a provider."); return; }
    if (hasRoster) {
      if (!selectedSlot) { setError("Pick one of the available slots."); return; }
    } else if (!scheduledAt) { setError("Pick a date & time."); return; }
    setSubmitting(true);
    try {
      await api.bookAppointment({
        patientId: patient.id,
        providerId,
        scheduledAt: hasRoster ? selectedSlot : new Date(scheduledAt).toISOString(),
        durationMinutes: duration,
        reason: reason || undefined,
      });
      router.replace("/appointments");
    } catch (err) {
      setError(err instanceof api.ApiRequestError ? err.message : "Could not book the appointment.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader title="Book appointment" description="Double-booking a provider's slot is rejected." />
      <form className="flex max-w-2xl flex-col gap-5" onSubmit={handleSubmit}>
        {error && <Alert tone="danger">{error}</Alert>}

        <Card header="Patient">
          {patient ? (
            <div className="flex items-center gap-3">
              <Badge tone="brand">{patient.uhid}</Badge>
              <span className="text-fg">{[patient.firstName, patient.lastName].filter(Boolean).join(" ")}</span>
              <Button variant="ghost" size="sm" type="button" onClick={() => { setPatient(null); setSearch(""); }}>Change</Button>
            </div>
          ) : (
            <div className="relative">
              <Field placeholder="Search patient by UHID, name, or phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
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

        <Card header="Schedule">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="hms-field">
              <span className="hms-label">Provider</span>
              <select className="hms-input" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
                <option value="">Select a provider…</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.fullName}</option>
                ))}
              </select>
            </label>
            {hasRoster ? (
              // The provider works to a roster: the date stays a DateField (ADR-048),
              // the time comes from a slot chip instead of free-form entry.
              <DateField
                label="Date"
                value={slotDate}
                min={todayApiDate()}
                onChange={(v) => {
                  setSlotDate(v);
                  if (!v) setScheduledAt("");
                }}
              />
            ) : (
              <DateTimeField
                label="Date & time"
                value={scheduledAt || null}
                minDate={todayApiDate()}
                onChange={(v) => {
                  setScheduledAt(v ?? "");
                  setSlotDate(v ? toApiDate(v) : null);
                }}
              />
            )}
            {hasRoster && (
              <div className="hms-field sm:col-span-2">
                <span className="hms-label">Available slots</span>
                {slotsLoading ? (
                  <p className="text-sm text-fg-muted">Checking availability…</p>
                ) : slots && slots.slots.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {slots.slots.map((s) => (
                      <Button
                        key={s.startsAt}
                        type="button"
                        size="sm"
                        variant={selectedSlot === s.startsAt ? "primary" : "secondary"}
                        aria-pressed={selectedSlot === s.startsAt}
                        onClick={() => setSelectedSlot(s.startsAt)}
                      >
                        {s.label}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-fg-muted">No free slots on this day — pick another date.</p>
                )}
                <p className="text-xs text-fg-subtle">This doctor books by roster slots; pick one to continue.</p>
              </div>
            )}
            <label className="hms-field">
              <span className="hms-label">Duration</span>
              <select className="hms-input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {[10, 15, 20, 30, 45, 60].map((d) => <option key={d} value={d}>{d} min</option>)}
              </select>
            </label>
            <Field label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </Card>

        <div className="flex items-center gap-3">
          {/* With a roster the chosen slot is required — the server enforces the window anyway. */}
          <Button type="submit" loading={submitting} disabled={hasRoster && !selectedSlot}>Book appointment</Button>
          <Link href="/appointments"><Button variant="ghost" type="button">Cancel</Button></Link>
        </div>
      </form>
    </>
  );
}

export default function NewAppointmentPage() {
  return (
    <RequirePermission perm={PERMISSIONS.APPOINTMENT_CREATE}>
      <Suspense fallback={null}>
        <BookForm />
      </Suspense>
    </RequirePermission>
  );
}
