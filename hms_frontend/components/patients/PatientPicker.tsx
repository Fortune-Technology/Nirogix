'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { UserPlus } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  DateField,
  Dialog,
  Field,
  PhoneField,
  Select,
  Spinner,
} from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
import { formatDate, todayApiDate } from '@hms/utils';
import type { CreatePatientRequest, DuplicatePatientCandidate, Patient } from '@hms/types';
import * as api from '../../lib/api';
import { useCan } from '../../lib/auth';

export interface PatientPickerProps {
  value: Patient | null;
  onChange: (patient: Patient | null) => void;
  /**
   * The patient is fixed by where the user came from — a referral, a booked
   * appointment — so it is shown but cannot be swapped. The server takes the patient
   * from that record regardless of what the client sends.
   */
  locked?: boolean;
  /** Placeholder for the search box; say what can be typed into it. */
  placeholder?: string;
}

const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

function fullName(p: { firstName: string; lastName?: string | null }): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ');
}

/**
 * Search for a patient, or register one without leaving the page.
 *
 * The front desk's first question is always "have we seen you before?", and the answer
 * is no often enough that sending the user to `/patients/new` and back — losing the
 * half-filled visit form on the way — is the single most-repeated piece of friction in
 * the check-in workflow. Registration therefore happens in a dialog here, and the new
 * chart is selected the moment it exists.
 *
 * The dialog asks only for what a chart needs to exist. Everything else (address, blood
 * group, emergency contact, ABHA) belongs on the full registration screen and stays
 * editable from the patient's own page afterwards — a queue of waiting patients is not
 * the moment to collect it.
 *
 * A duplicate is surfaced, never silently created: the server's `DUPLICATE_PATIENT`
 * response lists the matching charts, and the likely-correct action — use the existing
 * one — is the primary button. Registering anyway stays available, because two people
 * genuinely do share a name and a birth year.
 *
 * Shared by check-in and appointment booking so both ask the question the same way
 * (ADR-029 — a pattern that appears twice gets extracted).
 */
export function PatientPicker({
  value,
  onChange,
  locked = false,
  placeholder,
}: PatientPickerProps) {
  const canCreate = useCan(PERMISSIONS.PATIENT_CREATE);

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreatePatientRequest>({ firstName: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicatePatientCandidate[] | null>(null);

  useEffect(() => {
    if (!search.trim() || value) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      api
        .listPatients(1, 6, search)
        .then((r) => setResults(r.data))
        .catch(() => setResults([]))
        .finally(() => {
          setSearching(false);
          setSearched(true);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [search, value]);

  function set<K extends keyof CreatePatientRequest>(key: K, v: CreatePatientRequest[K]) {
    setForm((prev) => ({ ...prev, [key]: v }));
  }

  /** Opens the dialog seeded from what was typed into the search box. */
  function openCreate() {
    const typed = search.trim();
    // A phone number typed into the search box is a phone number, not a name. Anything
    // else is far more likely the patient's name — either way the user can correct it.
    const isPhone = /^[\d+\s-]{6,}$/.test(typed);
    const [first, ...rest] = typed.split(/\s+/);
    setForm({
      firstName: isPhone ? '' : (first ?? ''),
      lastName: isPhone ? undefined : rest.join(' ') || undefined,
      phone: isPhone ? typed.replace(/\D/g, '').slice(-10) : undefined,
    });
    setError(null);
    setDuplicates(null);
    setCreating(true);
  }

  function selectAndClose(patient: Patient) {
    onChange(patient);
    setCreating(false);
    setSearch('');
    setResults([]);
    setSearched(false);
  }

  async function save(allowDuplicate?: boolean) {
    setError(null);
    setSaving(true);
    try {
      // Drop empty strings so the optional fields validate cleanly server-side.
      const body = Object.fromEntries(
        Object.entries(form).filter(([, v]) => v !== '' && v != null),
      ) as CreatePatientRequest;
      if (allowDuplicate) body.allowDuplicate = true;
      selectAndClose(await api.createPatient(body));
    } catch (err) {
      if (err instanceof api.ApiRequestError && err.code === 'DUPLICATE_PATIENT') {
        const details = err.details as { candidates?: DuplicatePatientCandidate[] } | undefined;
        setDuplicates(details?.candidates ?? []);
      } else {
        setError(
          err instanceof api.ApiRequestError ? err.message : 'Could not register the patient.',
        );
      }
    } finally {
      setSaving(false);
    }
  }

  /** The duplicate list gives ids only, so the chosen chart is fetched before selecting it. */
  async function selectExisting(id: string) {
    setSaving(true);
    try {
      selectAndClose(await api.getPatient(id));
    } catch {
      setError('Could not open that patient.');
    } finally {
      setSaving(false);
    }
  }

  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="brand">{value.uhid}</Badge>
        <span className="text-fg">{fullName(value)}</span>
        {value.phone && <span className="text-sm text-fg-muted">{value.phone}</span>}
        {!locked && (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => {
              onChange(null);
              setSearch('');
            }}
          >
            Change
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <div>
        <Field
          label="Find the patient"
          placeholder={placeholder ?? 'Search by UHID, name, or phone…'}
          value={search}
          autoComplete="off"
          onChange={(e) => setSearch(e.target.value)}
          hint="Type at least part of a name, the UHID, or the mobile number."
        />

        {searching && (
          <p className="mt-2 flex items-center gap-2 text-sm text-fg-muted">
            <Spinner /> Searching…
          </p>
        )}

        {results.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 rounded-token border border-border bg-surface p-1">
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-token px-3 py-2 text-left text-sm hover:bg-surface-2"
                  onClick={() => selectAndClose(p)}
                >
                  <span className="font-mono text-xs text-fg-muted">{p.uhid}</span>
                  <span className="text-fg">{fullName(p)}</span>
                  {p.phone && <span className="ml-auto text-xs text-fg-subtle">{p.phone}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* The empty result is the moment registration is actually needed, so it is stated
            plainly rather than left as an absence the user has to interpret. */}
        {canCreate && (
          <div className="mt-3">
            {searched && !searching && results.length === 0 ? (
              <div className="flex flex-wrap items-center gap-3 rounded-token border border-dashed border-border px-3 py-3">
                <span className="text-sm text-fg-muted">No patient matches “{search.trim()}”.</span>
                <Button type="button" size="sm" onClick={openCreate}>
                  <UserPlus size={16} strokeWidth={2} /> Register new patient
                </Button>
              </div>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={openCreate}>
                <UserPlus size={16} strokeWidth={2} /> Register new patient
              </Button>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Register patient"
        description="Only what a chart needs to exist. The rest can be filled in from the patient's page."
        busy={saving}
        size="md"
        footer={
          duplicates ? (
            <>
              <Button
                variant="ghost"
                type="button"
                onClick={() => setDuplicates(null)}
                disabled={saving}
              >
                Back to the form
              </Button>
              <Button
                variant="secondary"
                type="button"
                loading={saving}
                onClick={() => void save(true)}
              >
                Register anyway
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                type="button"
                onClick={() => setCreating(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" form="patient-picker-create" loading={saving}>
                Register &amp; continue
              </Button>
            </>
          )
        }
      >
        {duplicates ? (
          <div className="flex flex-col gap-3">
            <Alert tone="neutral">
              {duplicates.length === 0
                ? 'A matching chart already exists.'
                : "These charts look like the same person. Using an existing one keeps the patient's history together."}
            </Alert>
            <ul className="flex flex-col gap-2">
              {duplicates.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-3 rounded-token border border-border px-3 py-2"
                >
                  <Badge tone="brand">{c.uhid}</Badge>
                  <span className="text-sm text-fg">{fullName(c)}</span>
                  <span className="text-xs text-fg-muted">
                    {c.phone ?? 'no phone'}
                    {c.dateOfBirth ? ` · ${formatDate(c.dateOfBirth)}` : ''}
                    {c.gender ? ` · ${c.gender}` : ''}
                  </span>
                  <Button
                    className="ml-auto"
                    size="sm"
                    type="button"
                    disabled={saving}
                    onClick={() => void selectExisting(c.id)}
                  >
                    Use this patient
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <form
            id="patient-picker-create"
            className="flex flex-col gap-4"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void save();
            }}
          >
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="First name"
                value={form.firstName}
                onChange={(e) => set('firstName', e.target.value)}
                required
                autoFocus
              />
              <Field
                label="Last name"
                value={form.lastName ?? ''}
                onChange={(e) => set('lastName', e.target.value)}
              />
              <Select
                label="Gender"
                value={form.gender ?? ''}
                onChange={(v) => set('gender', v || null)}
                options={GENDERS}
                placeholder="Not stated"
                clearable
              />
              <DateField
                label="Date of birth"
                value={form.dateOfBirth ?? null}
                max={todayApiDate()}
                onChange={(v) => set('dateOfBirth', v)}
              />
              <PhoneField
                label="Phone"
                value={form.phone ?? ''}
                onChange={(v) => set('phone', v)}
              />
            </div>
            <p className="text-xs text-fg-subtle">A UHID is assigned automatically on save.</p>
          </form>
        )}
      </Dialog>
    </>
  );
}
