'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarClock, Zap } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  DateField,
  DateTimeField,
  emptyLabel,
  Field,
  Select,
  Textarea,
  type SelectOption,
} from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
import { toApiDate, todayApiDate } from '@hms/utils';
import type {
  ArrivalType,
  Department,
  FreeSlots,
  HospitalWorkflowConfig,
  Patient,
  Provider,
  Referral,
  ResolvedConsultationFee,
  VisitTiming,
} from '@hms/types';
import * as api from '../../lib/api';
import { PageHeader } from '../PageHeader';
import { PatientPicker } from '../patients/PatientPicker';
import { PatientHistory } from '../patients/PatientHistory';
import { CasePicker, NO_CASE, type CaseChoice } from './CasePicker';
import { useCan } from '../../lib/auth';
import { formatPaise, rupeesToPaise } from '../../lib/money';
import {
  EMPTY_VITALS,
  VitalsFields,
  hasAnyReading,
  toVitalsPayload,
  type VitalsDraft,
} from '../vitals/VitalsFields';

/**
 * The one workflow that brings a patient into the hospital (ADR-115).
 *
 * Booking an appointment and checking a walk-in in were two forms asking almost exactly the same
 * questions — which patient, which doctor, which department, what for, how much — and differing in
 * one thing: **when**. Two forms meant two patient searches, two provider pickers, two ideas of how
 * long a chief complaint may be, and a department field on only one of them.
 *
 * So there is one form, and `timing` is a control inside it rather than a choice of page. `now`
 * checks the patient in and puts them in today's queue; `future` books them a slot. Everything
 * above that line is identical, and stays identical because it is written once.
 *
 * **The two routes remain**, because they are what the navigation, the patient chart and everyone's
 * bookmarks link to — and because the permissions genuinely differ. They are thin: each renders
 * this component with a different starting timing.
 */

const DURATIONS = [10, 15, 20, 30, 45, 60].map((d) => ({ value: String(d), label: `${d} min` }));

const ARRIVAL_OPTIONS: Array<{ value: ArrivalType; label: string; description: string }> = [
  { value: 'walk_in', label: 'Walk-in', description: 'Arrived without an appointment' },
  {
    value: 'appointment',
    label: 'First visit',
    description: 'A new problem, or a first visit to this doctor',
  },
  {
    value: 'follow_up',
    label: 'Follow-up',
    description: 'Coming back about something already being treated',
  },
];

export interface VisitWorkflowProps {
  /** Which half of the workflow the page starts on. The user can switch, if permitted. */
  defaultTiming: VisitTiming;
}

export function VisitWorkflow({ defaultTiming }: VisitWorkflowProps) {
  const router = useRouter();
  const params = useSearchParams();

  // Each timing needs its own permission, so the toggle is not offered to someone who could not
  // act on it. The server refuses either way — this only avoids showing a control that leads to a
  // 403.
  const canCheckIn = useCan(PERMISSIONS.OPD_CHECKIN);
  const canBook = useCan(PERMISSIONS.APPOINTMENT_CREATE);
  // Charging other than the price list is its own permission, so most desks never see the control
  // at all — and the server refuses it regardless of what the form renders.
  const canOverrideFee = useCan(PERMISSIONS.BILLING_FEE_OVERRIDE);

  const [timing, setTiming] = useState<VisitTiming>(defaultTiming);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);

  const [providerId, setProviderId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [arrivalType, setArrivalType] = useState<ArrivalType>(
    defaultTiming === 'now' ? 'walk_in' : 'appointment',
  );
  /** Empty means not stated. Only ever offered where the hospital has defined a vocabulary (ADR-121). */
  const [consultationType, setConsultationType] = useState('');
  const [reason, setReason] = useState('');
  // Which course of treatment this visit belongs to, if any (ADR-116).
  const [caseChoice, setCaseChoice] = useState<CaseChoice>(NO_CASE);

  // "Right now" only.
  // What the fee schedule says this consultation costs (ADR-117), and — separately — what the
  // desk has chosen to charge instead. Keeping them apart is what makes an override visible.
  const [calculatedFee, setCalculatedFee] = useState<ResolvedConsultationFee | null>(null);
  const [overriding, setOverriding] = useState(false);
  const [feeRupees, setFeeRupees] = useState('');
  const [feeOverrideReason, setFeeOverrideReason] = useState('');
  const [workflow, setWorkflow] = useState<HospitalWorkflowConfig | null>(null);
  const [vitals, setVitals] = useState<VitalsDraft>(EMPTY_VITALS);

  // "Future" only — roster slots (ADR-069). `slots === null` means no roster is known, and
  // free-form date & time entry stays.
  const [scheduledAt, setScheduledAt] = useState('');
  const [slotDate, setSlotDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<FreeSlots | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [duration, setDuration] = useState(15);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const appointmentId = params.get('appointmentId');
  const referralId = params.get('referralId');
  const [referral, setReferral] = useState<Referral | null>(null);
  const [referralGone, setReferralGone] = useState(false);

  const isNow = timing === 'now';
  const hasRoster = slots?.hasRoster === true;
  const collectsVitals = isNow && workflow?.vitalsMode === 'during_checkin';

  // Arriving against a booked appointment or a pending referral pins the timing: neither can be
  // turned into a future booking, and offering the switch would be a control that cannot work.
  const timingLocked = Boolean(appointmentId || referral);

  useEffect(() => {
    Promise.allSettled([
      api.listProviders(),
      api.listDepartments({ activeOnly: true }),
      api.getWorkflowConfig(),
    ])
      .then(([p, d, w]) => {
        setProviders(p.status === 'fulfilled' ? p.value : []);
        setDepartments(d.status === 'fulfilled' ? d.value : []);
        setWorkflow(w.status === 'fulfilled' ? w.value : null);
      })
      .finally(() => setLoadingLists(false));

    const pid = params.get('patientId');
    if (pid)
      api
        .getPatient(pid)
        .then(setPatient)
        .catch(() => {});
    const prov = params.get('providerId');
    if (prov) setProviderId(prov);
  }, [params]);

  // Checking in against a booked appointment: it is already a "now", whatever the page started as.
  useEffect(() => {
    if (appointmentId) setTiming('now');
  }, [appointmentId]);

  // The referral worklist (ADR-068) carries the patient and where they were sent, so the desk
  // confirms rather than re-enters. There is no single-get for referrals — anything not in the
  // pending list is no longer actionable.
  useEffect(() => {
    if (!referralId) return;
    api
      .listReferrals({ status: 'pending' })
      .then((rs) => {
        const r = rs.find((x) => x.id === referralId);
        if (!r) {
          setReferralGone(true);
          return;
        }
        setReferral(r);
        setTiming('now');
        setDepartmentId(r.toDepartmentId);
        setProviderId(r.toProviderId ?? '');
        setArrivalType('follow_up');
        api
          .getPatient(r.patientId)
          .then(setPatient)
          .catch(() => {});
      })
      .catch(() => {
        /* the load failure itself is reported by the shared API-feedback layer */
      });
  }, [referralId]);

  // Free slots, refreshed whenever the provider or the date changes. Only meaningful for a future
  // booking, so it is not fetched at all while the workflow is on "right now".
  useEffect(() => {
    setSelectedSlot('');
    if (isNow || !providerId || !slotDate) {
      setSlots(null);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    api
      .listProviderSlots(providerId, slotDate)
      // Falling back to free-form entry is safe: the server enforces the roster regardless.
      .then((s) => !cancelled && setSlots(s))
      .catch(() => !cancelled && setSlots(null))
      .finally(() => !cancelled && setSlotsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isNow, providerId, slotDate]);

  // What the case says this visit is, whichever way the case was chosen — the dimension that
  // outranks consultation type in the schedule, so the quote is wrong without it.
  const caseTypeForPricing =
    caseChoice.kind === 'existing'
      ? caseChoice.caseType
      : caseChoice.kind === 'new'
        ? caseChoice.caseType
        : null;

  // The desk quotes the fee as it picks the doctor, rather than remembering a policy. Re-run
  // whenever anything the schedule keys on changes; a failure leaves no calculated fee shown
  // rather than a wrong one.
  useEffect(() => {
    if (!isNow) {
      setCalculatedFee(null);
      return;
    }
    let cancelled = false;
    api
      .previewConsultationFee({
        providerId: providerId || undefined,
        departmentId: departmentId || undefined,
        arrivalType,
        consultationType: consultationType || undefined,
        // From the case that was picked, or the one about to be opened. The quote has to match
        // what the server will charge, and the server prices from the case.
        caseType: caseTypeForPricing || undefined,
      })
      .then((f) => !cancelled && setCalculatedFee(f))
      .catch(() => !cancelled && setCalculatedFee(null));
    return () => {
      cancelled = true;
    };
  }, [isNow, providerId, departmentId, arrivalType, consultationType, caseTypeForPricing]);

  const providerOptions = useMemo<SelectOption[]>(
    () =>
      providers
        .filter((p) => p.isActive)
        .map((p) => ({
          value: p.id,
          label: p.fullName,
          description:
            p.specialties.length > 0 ? p.specialties.join(', ') : (p.qualification ?? undefined),
          // The fee is quoted at the moment the doctor is picked — but only where a fee is about
          // to be charged. On a future booking it is not yet a commitment.
          meta:
            isNow && p.consultationFeePaise != null
              ? formatPaise(p.consultationFeePaise)
              : undefined,
          keywords: p.specialties.join(' '),
        })),
    [providers, isNow],
  );

  const departmentOptions = useMemo<SelectOption[]>(
    () => departments.map((d) => ({ value: d.id, label: d.name })),
    [departments],
  );

  /** Switching timing keeps every shared answer; only the half that no longer applies is reset. */
  const switchTiming = useCallback((next: VisitTiming) => {
    setTiming(next);
    setError(null);
    if (next === 'now') {
      setScheduledAt('');
      setSlotDate(null);
      setSelectedSlot('');
      setArrivalType((prev) => (prev === 'appointment' ? 'walk_in' : prev));
    } else {
      setFeeRupees('');
      setFeeOverrideReason('');
      setOverriding(false);
      setVitals(EMPTY_VITALS);
      setCaseChoice(NO_CASE);
      setArrivalType((prev) => (prev === 'walk_in' ? 'appointment' : prev));
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!patient) {
      setError('Select a patient.');
      return;
    }

    if (isNow) {
      if (caseChoice.kind === 'new' && !caseChoice.title.trim()) {
        setError('Give the new case a title, or check the patient in without one.');
        return;
      }
      const feeTyped = overriding && feeRupees.trim() !== '';
      const fee = Number(feeRupees);
      if (feeTyped && (!Number.isFinite(fee) || fee < 0)) {
        setError('Enter a valid consultation fee.');
        return;
      }
      // Said here as well as on the server, because a round trip to be told to type a sentence is
      // a poor way to learn it was needed.
      const differs =
        feeTyped && calculatedFee != null && rupeesToPaise(fee) !== calculatedFee.feePaise;
      if (differs && !feeOverrideReason.trim()) {
        setError('Give a reason for charging a different amount.');
        return;
      }
      setSubmitting(true);
      try {
        await api.checkIn({
          patientId: patient.id,
          appointmentId: appointmentId ?? undefined,
          referralId: referral?.id,
          providerId: providerId || undefined,
          departmentId: departmentId || undefined,
          reason: reason.trim() || undefined,
          arrivalType,
          consultationType: consultationType || undefined,
          caseId: caseChoice.kind === 'existing' ? caseChoice.caseId : undefined,
          newCase:
            caseChoice.kind === 'new' && caseChoice.title.trim()
              ? {
                  title: caseChoice.title.trim(),
                  notes: caseChoice.notes.trim() || undefined,
                  caseType: caseChoice.caseType || undefined,
                }
              : undefined,
          consultationFeePaise: feeTyped ? rupeesToPaise(fee) : undefined,
          feeOverrideReason: feeTyped ? feeOverrideReason.trim() || undefined : undefined,
          vitals: collectsVitals && hasAnyReading(vitals) ? toVitalsPayload(vitals) : undefined,
        });
        router.replace('/opd');
      } catch (err) {
        setError(
          err instanceof api.ApiRequestError ? err.message : 'Could not check the patient in.',
        );
        setSubmitting(false);
      }
      return;
    }

    if (!providerId) {
      setError('Select a doctor.');
      return;
    }
    if (hasRoster && !selectedSlot) {
      setError('Pick one of the available slots.');
      return;
    }
    if (!hasRoster && !scheduledAt) {
      setError('Pick a date and time.');
      return;
    }
    setSubmitting(true);
    try {
      await api.bookAppointment({
        patientId: patient.id,
        providerId,
        departmentId: departmentId || undefined,
        scheduledAt: hasRoster ? selectedSlot : new Date(scheduledAt).toISOString(),
        durationMinutes: duration,
        reason: reason.trim() || undefined,
        arrivalType: arrivalType === 'walk_in' ? 'appointment' : arrivalType,
      });
      router.replace('/appointments');
    } catch (err) {
      setError(
        err instanceof api.ApiRequestError ? err.message : 'Could not book the appointment.',
      );
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title={isNow ? 'Check in' : 'Book appointment'}
        description={
          isNow
            ? 'Creates a visit (queue token) and opens a consultation-fee invoice.'
            : 'Books a future slot. Double-booking a provider is rejected.'
        }
      />

      {/* Two columns on a desk monitor, stacked on anything narrower. The form keeps its own
          readable width rather than stretching: a check-in form the width of a 27-inch screen is
          harder to fill in, not easier. */}
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <form className="flex w-full max-w-2xl flex-col gap-5" onSubmit={handleSubmit}>
          {error && <Alert tone="danger">{error}</Alert>}
          {appointmentId && <Alert tone="neutral">Checking in against a booked appointment.</Alert>}
          {referral && (
            <Alert tone="neutral">
              Checking in against a referral from {referral.fromProviderName ?? 'the OPD'}:{' '}
              {referral.reason}
            </Alert>
          )}
          {referralGone && <Alert tone="danger">That referral is no longer pending.</Alert>}

          {/* The one thing that actually differs between the two halves of this workflow, asked
            first because every field below reads differently depending on the answer. */}
          {!timingLocked && canCheckIn && canBook && (
            <Card header="When">
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="When is the patient being seen"
              >
                <Button
                  type="button"
                  variant={isNow ? 'primary' : 'secondary'}
                  aria-pressed={isNow}
                  onClick={() => switchTiming('now')}
                >
                  <Zap size={16} strokeWidth={2} aria-hidden /> Right now
                </Button>
                <Button
                  type="button"
                  variant={!isNow ? 'primary' : 'secondary'}
                  aria-pressed={!isNow}
                  onClick={() => switchTiming('future')}
                >
                  <CalendarClock size={16} strokeWidth={2} aria-hidden /> Future appointment
                </Button>
              </div>
              <p className="mt-3 text-sm text-fg-muted">
                {isNow
                  ? "The patient is here. Checking in puts them in today's queue and opens their bill."
                  : 'The patient is booking for later. Nothing is queued and no bill is raised until they arrive.'}
              </p>
            </Card>
          )}

          <Card header="Patient">
            {/* Changing the patient clears the case: it belonged to the previous chart, and the
              server would refuse it anyway. */}
            <PatientPicker
              value={patient}
              onChange={(p) => {
                setPatient(p);
                setCaseChoice(NO_CASE);
              }}
              locked={timingLocked}
            />
          </Card>

          {/* Only for a "right now" visit: a future booking has no visit to attach to a case yet,
            and the case is chosen when the patient actually arrives. */}
          {isNow && (
            <Card header="Treatment case">
              <CasePicker
                patientId={patient?.id ?? null}
                value={caseChoice}
                onChange={setCaseChoice}
                preferExisting={arrivalType === 'follow_up'}
                caseTypes={workflow?.caseTypes ?? []}
              />
            </Card>
          )}

          <Card header="Visit">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Department"
                value={departmentId}
                onChange={setDepartmentId}
                options={departmentOptions}
                placeholder="Not specified"
                loading={loadingLists}
                clearable
                emptyMessage="No active departments."
                hint="Optional."
              />
              <Select
                label="Doctor"
                value={providerId}
                onChange={setProviderId}
                options={providerOptions}
                placeholder={isNow ? 'Assign later' : 'Select a doctor…'}
                loading={loadingLists}
                clearable={isNow}
                required={!isNow}
                emptyMessage="No active doctors."
                hint={isNow ? "Optional — the doctor's fee sets the default charge." : undefined}
              />

              {/* Only where the hospital has said what kinds of consultation it offers. A dropdown
                with nothing in it is worse than no dropdown. */}
              {(workflow?.consultationTypes.length ?? 0) > 0 && (
                <Select
                  label="Consultation type"
                  value={consultationType}
                  onChange={setConsultationType}
                  options={(workflow?.consultationTypes ?? []).map((t) => ({ value: t, label: t }))}
                  searchable={(workflow?.consultationTypes.length ?? 0) > 7}
                  clearable
                  placeholder="Not specified"
                  hint="Optional. It can change what is charged."
                />
              )}

              <Select
                label="Visit type"
                value={arrivalType}
                onChange={(v) => setArrivalType(v as ArrivalType)}
                // A future booking is never a walk-in by definition.
                options={ARRIVAL_OPTIONS.filter((o) => (isNow ? true : o.value !== 'walk_in'))}
                searchable={false}
                disabled={Boolean(referral)}
                hint={
                  referral
                    ? 'Set from the referral this patient was sent on.'
                    : 'A follow-up is a return about something already being treated.'
                }
              />

              {isNow && (
                <div className="sm:col-span-2">
                  <span className="hms-label">Consultation fee</span>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    <span className="text-lg font-semibold text-fg">
                      {calculatedFee
                        ? formatPaise(calculatedFee.feePaise)
                        : emptyLabel('notConfigured')}
                    </span>
                    {/* Saying WHERE the number came from is what turns a price into an answer the
                      desk can give a patient who asks. */}
                    {calculatedFee?.source === 'rule' && (
                      <Badge tone="neutral">
                        {calculatedFee.ruleLabel ?? 'From the fee schedule'}
                      </Badge>
                    )}
                    {calculatedFee?.source === 'provider_default' && (
                      <Badge tone="neutral">The doctor&rsquo;s own fee</Badge>
                    )}
                    {canOverrideFee && !overriding && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setOverriding(true);
                          setFeeRupees(calculatedFee ? String(calculatedFee.feePaise / 100) : '');
                        }}
                      >
                        Charge a different amount
                      </Button>
                    )}
                  </div>

                  {overriding && (
                    <div className="mt-3 grid gap-4 rounded-token border border-border p-4 sm:grid-cols-2">
                      <Field
                        label="Charge instead (₹)"
                        type="number"
                        min={0}
                        step="0.01"
                        value={feeRupees}
                        autoFocus
                        onChange={(e) => setFeeRupees(e.target.value)}
                        hint={
                          calculatedFee
                            ? `The schedule says ${formatPaise(calculatedFee.feePaise)}.`
                            : undefined
                        }
                      />
                      <Field
                        label="Reason"
                        value={feeOverrideReason}
                        maxLength={300}
                        onChange={(e) => setFeeOverrideReason(e.target.value)}
                        placeholder="Concession agreed, staff rate, camp pricing…"
                        hint="Recorded on the visit and in the audit log."
                      />
                      <div className="sm:col-span-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setOverriding(false);
                            setFeeRupees('');
                            setFeeOverrideReason('');
                          }}
                        >
                          Use the calculated fee instead
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!isNow && (
                <>
                  {hasRoster ? (
                    <DateField
                      label="Date"
                      value={slotDate}
                      min={todayApiDate()}
                      onChange={(v) => {
                        setSlotDate(v);
                        if (!v) setScheduledAt('');
                      }}
                    />
                  ) : (
                    <DateTimeField
                      label="Date & time"
                      value={scheduledAt || null}
                      minDate={todayApiDate()}
                      onChange={(v) => {
                        setScheduledAt(v ?? '');
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
                              variant={selectedSlot === s.startsAt ? 'primary' : 'secondary'}
                              aria-pressed={selectedSlot === s.startsAt}
                              onClick={() => setSelectedSlot(s.startsAt)}
                            >
                              {s.label}
                            </Button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-fg-muted">
                          No free slots on this day. Pick another date.
                        </p>
                      )}
                      <p className="text-xs text-fg-subtle">
                        This doctor books by roster slots; pick one to continue.
                      </p>
                    </div>
                  )}

                  <Select
                    label="Duration"
                    value={String(duration)}
                    onChange={(v) => setDuration(Number(v))}
                    options={DURATIONS}
                    searchable={false}
                  />
                </>
              )}
            </div>

            {/* One field, one limit, whichever half of the workflow is showing — a chief complaint
              that fitted before switching and not after would be the worst kind of surprise. */}
            <div className="mt-4">
              <Textarea
                label="Reason for visit / chief complaint"
                value={reason}
                rows={4}
                maxLength={2000}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What the patient has come in for, in their own words where possible…"
                hint={`Optional. ${reason.length}/2000 characters — write as much as the doctor needs.`}
              />
            </div>
          </Card>

          {collectsVitals && (
            <Card header="Vitals">
              <p className="mb-4 text-sm text-fg-muted">
                This hospital records vitals at the front desk. The doctor can amend them during the
                consultation.
              </p>
              <VitalsFields
                value={vitals}
                onChange={setVitals}
                required={workflow?.vitalsRequiredParams ?? []}
                optional={workflow?.vitalsOptionalParams ?? []}
              />
            </Card>
          )}

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              loading={submitting}
              disabled={!isNow && hasRoster && !selectedSlot}
            >
              {isNow ? 'Check in' : 'Book appointment'}
            </Button>
            <Link href={isNow ? '/opd' : '/appointments'}>
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </Link>
          </div>
        </form>

        {/* The patient's record beside the form, so the desk answers "have we seen this before?"
            without leaving a half-filled check-in. Every block inside is permission-gated: a
            receptionist sees cases, visits, bills and documents; the consultations block, which
            carries diagnoses, needs `emr.encounter.view` and is simply absent without it.

            Records held by OTHER hospitals are not here. Those need the patient's consent and are
            requested by a named clinician from the chart (ADR-092) — not pulled into a desk-side
            panel because a patient walked up. */}
        {patient && (
          <aside className="w-full xl:max-w-sm" aria-label={`Record for ${patient.firstName}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-fg">This patient</h2>
              <Link href={`/patients/${patient.id}`} className="text-sm text-brand hover:underline">
                Open full record
              </Link>
            </div>
            <PatientHistory patientId={patient.id} layout="rail" heading={null} />
          </aside>
        )}
      </div>
    </>
  );
}
