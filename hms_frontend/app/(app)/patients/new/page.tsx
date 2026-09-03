'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Card, DateField, Dialog, Field, PhoneField, Select } from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
import { BLOOD_GROUP_OPTIONS, formatDate, GENDER_OPTIONS, todayApiDate } from '@hms/utils';
import type { CreatePatientRequest, DuplicatePatientCandidate } from '@hms/types';
import type { AbhaPrefill } from '@hms/types';
import * as api from '../../../../lib/api';
import { Can, RequirePermission } from '../../../../components/Can';
import { PageHeader } from '../../../../components/PageHeader';
import { AbhaVerificationPanel } from '../../../../components/abdm/AbhaVerificationPanel';

function RegisterForm() {
  const router = useRouter();
  const [f, setF] = useState<CreatePatientRequest>({ firstName: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // The DUPLICATE_PATIENT 409: matching charts to review before anything is created.
  const [duplicates, setDuplicates] = useState<DuplicatePatientCandidate[] | null>(null);
  // Set once an ABHA has been verified (ADR-084). Held until the chart exists, because the ABHA
  // is linked to a patient id — so the verification has to outlive the form submit, and only a
  // successful registration turns it into a link.
  const [abhaTxnId, setAbhaTxnId] = useState<string | null>(null);

  function set<K extends keyof CreatePatientRequest>(key: K, value: CreatePatientRequest[K]) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  function buildBody(allowDuplicate?: boolean): CreatePatientRequest {
    // Drop empty strings so optional fields validate cleanly.
    const body = Object.fromEntries(
      Object.entries(f).filter(([, v]) => v !== '' && v != null),
    ) as CreatePatientRequest;
    if (allowDuplicate) body.allowDuplicate = true;
    return body;
  }

  /**
   * Fills the form from a verified ABHA profile.
   *
   * Only empty fields are overwritten, so a receptionist who has already typed something the
   * patient corrected in person does not lose it to the ABDM record. Every field stays editable.
   */
  function applyAbhaPrefill(prefill: AbhaPrefill, transactionId: string) {
    setF((prev) => {
      const next = { ...prev };
      for (const [key, value] of Object.entries(prefill)) {
        if (value == null || value === '') continue;
        const current = (next as Record<string, unknown>)[key];
        if (current == null || current === '') (next as Record<string, unknown>)[key] = value;
      }
      return next;
    });
    setAbhaTxnId(transactionId);
  }

  async function submit(allowDuplicate?: boolean) {
    setError(null);
    setSubmitting(true);
    try {
      const created = await api.createPatient(buildBody(allowDuplicate));
      // Registration succeeded, so the verified ABHA can now be attached to a real chart. A
      // failure here does not undo the registration — the patient is registered either way, and
      // the ABHA can be linked again from the chart — so it never blocks the redirect.
      if (abhaTxnId) {
        try {
          await api.linkAbhaToPatient({ transactionId: abhaTxnId, patientId: created.id });
        } catch {
          // Reported by the shared client's error toast; the chart is already saved.
        }
      }
      router.replace(`/patients/${created.id}`);
    } catch (err) {
      if (err instanceof api.ApiRequestError && err.code === 'DUPLICATE_PATIENT') {
        const details = err.details as { candidates?: DuplicatePatientCandidate[] } | undefined;
        setDuplicates(details?.candidates ?? []);
      } else {
        setError(
          err instanceof api.ApiRequestError ? err.message : 'Could not register the patient.',
        );
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
      <PageHeader
        title="Register patient"
        description="A UHID is assigned automatically on save."
      />
      {/* ABDM Milestone 1 (ADR-084): verify first, type second. Rendered only for staff who hold
          the permission; the API additionally refuses any hospital not entitled to the module, so
          this is UX, never the boundary. */}
      <div className="mb-5 max-w-3xl">
        <Can perm={PERMISSIONS.ABDM_VERIFY}>
          <AbhaVerificationPanel onUseDetails={applyAbhaPrefill} />
        </Can>
      </div>

      <form className="flex max-w-3xl flex-col gap-5" onSubmit={handleSubmit}>
        {error && <Alert tone="danger">{error}</Alert>}

        <Card header="Identity">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="First name"
              value={f.firstName}
              onChange={(e) => set('firstName', e.target.value)}
              required
              autoFocus
            />
            <Field
              label="Last name"
              value={f.lastName ?? ''}
              onChange={(e) => set('lastName', e.target.value)}
            />
            <Select
              label="Gender"
              value={f.gender ?? ''}
              onChange={(v) => set('gender', v)}
              options={GENDER_OPTIONS}
              placeholder="Not specified"
              clearable
            />
            <DateField
              label="Date of birth"
              value={f.dateOfBirth ?? null}
              max={todayApiDate()}
              onChange={(v) => set('dateOfBirth', v ?? '')}
            />
            <Select
              label="Blood group"
              value={f.bloodGroup ?? ''}
              onChange={(v) => set('bloodGroup', v)}
              options={BLOOD_GROUP_OPTIONS}
              placeholder="Not recorded"
              clearable
            />
            <Field
              label="ABHA number (optional)"
              value={f.abhaNumber ?? ''}
              onChange={(e) => {
                // Typing over a verified number drops the verification with it: what follows is
                // a hand-entered value, and the backend would un-verify it anyway (ADR-084).
                if (abhaTxnId) setAbhaTxnId(null);
                set('abhaNumber', e.target.value);
              }}
              hint={
                abhaTxnId ? 'Verified with ABDM — it will be linked when you register.' : undefined
              }
            />
          </div>
        </Card>

        <Card header="Contact">
          <div className="grid gap-4 sm:grid-cols-2">
            <PhoneField label="Phone" value={f.phone ?? ''} onChange={(v) => set('phone', v)} />
            <Field
              label="Email"
              type="email"
              value={f.email ?? ''}
              onChange={(e) => set('email', e.target.value)}
            />
            <Field
              label="Address"
              value={f.addressLine ?? ''}
              onChange={(e) => set('addressLine', e.target.value)}
            />
            <Field
              label="City"
              value={f.city ?? ''}
              onChange={(e) => set('city', e.target.value)}
            />
            <Field
              label="State"
              value={f.state ?? ''}
              onChange={(e) => set('state', e.target.value)}
            />
            <Field
              label="PIN code"
              value={f.pincode ?? ''}
              onChange={(e) => set('pincode', e.target.value)}
            />
          </div>
        </Card>

        <Card header="Emergency contact">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Name"
              value={f.emergencyContactName ?? ''}
              onChange={(e) => set('emergencyContactName', e.target.value)}
            />
            <Field
              label="Phone"
              value={f.emergencyContactPhone ?? ''}
              onChange={(e) => set('emergencyContactPhone', e.target.value)}
            />
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={submitting}>
            Register patient
          </Button>
          <Link href="/patients">
            <Button variant="ghost" type="button">
              Cancel
            </Button>
          </Link>
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
                <span className="font-medium text-fg">
                  {[c.firstName, c.lastName].filter(Boolean).join(' ')}
                </span>
                <span className="ml-2 font-mono text-xs text-fg-muted">{c.uhid}</span>
                <p className="text-xs text-fg-muted">
                  {c.phone ?? 'no phone'} ·{' '}
                  {c.dateOfBirth ? formatDate(c.dateOfBirth) : 'DOB unknown'}
                  {c.gender ? ` · ${c.gender}` : ''}
                </p>
              </div>
              <Link href={`/patients/${c.id}`}>
                <Button size="sm">Use this patient</Button>
              </Link>
            </li>
          ))}
        </ul>
        {(duplicates ?? []).length === 0 && (
          <Badge tone="neutral">No candidate details available</Badge>
        )}
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
