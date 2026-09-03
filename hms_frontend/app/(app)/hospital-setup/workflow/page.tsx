'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { Alert, Badge, Button, Card, Field, Select, Skeleton } from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
import {
  VITAL_PARAMETERS,
  type Branch,
  type HospitalWorkflowConfig,
  type PaymentTiming,
  type VitalParameter,
  type VitalsMode,
} from '@hms/types';
import * as api from '../../../../lib/api';
import { RequirePermission } from '../../../../components/Can';
import { useCan } from '../../../../lib/auth';

/**
 * How this hospital runs its workflow (ADR-113).
 *
 * Two hospitals in one organization genuinely work differently — one takes vitals at the desk, the
 * other has a nurse's room; one collects the fee before the consultation, the other bills an
 * employer afterwards. Neither is more correct, so this screen chooses rather than the code.
 *
 * Every setting here is enforced on the server. This page is where the choice is made, never where
 * it is applied.
 */

const VITALS_MODE_OPTIONS: Array<{ value: VitalsMode; label: string; description: string }> = [
  {
    value: 'consultation_only',
    label: 'In the consultation',
    description: 'The doctor records vitals while seeing the patient. This is the default.',
  },
  {
    value: 'during_checkin',
    label: 'At the front desk, during check-in',
    description: 'The receptionist records them on the check-in form itself.',
  },
  {
    value: 'after_checkin',
    label: 'In a separate vitals step, after check-in',
    description:
      'The patient joins a vitals queue; a nurse or assistant records them before the consultation.',
  },
  {
    value: 'disabled',
    label: 'Not at all',
    description: 'This hospital does not record vitals.',
  },
];

const PAYMENT_TIMING_OPTIONS: Array<{ value: PaymentTiming; label: string; description: string }> =
  [
    {
      value: 'before_consultation',
      label: 'Before the consultation starts',
      description:
        'The doctor cannot open the consultation until the fee is settled. This is the default.',
    },
    {
      value: 'at_checkin',
      label: 'At the front desk, during check-in',
      description:
        'The same rule; the desk collects immediately rather than sending the patient to a counter.',
    },
    {
      value: 'after_consultation',
      label: 'After the consultation',
      description:
        'No gate — the patient is seen and settles on the way out. For employer or insurer billing.',
    },
  ];

const PARAM_LABELS: Record<VitalParameter, string> = {
  bloodPressure: 'Blood pressure',
  pulse: 'Pulse',
  spo2: 'SpO₂',
  respRate: 'Respiratory rate',
  tempC: 'Temperature',
  weightKg: 'Weight',
  heightCm: 'Height',
  bloodSugar: 'Blood sugar',
};

/** What a parameter is set to. Three states, because "offered" and "insisted on" are different. */
type ParamState = 'off' | 'optional' | 'required';

const PARAM_STATE_OPTIONS = [
  { value: 'off', label: 'Not collected' },
  { value: 'optional', label: 'Offered' },
  { value: 'required', label: 'Required' },
];

const ORG_SCOPE = '__org__';

/**
 * A short list of the hospital's own words (ADR-121).
 *
 * Deliberately a chip list rather than a comma-separated text field: these values are stored on
 * every visit and every case that uses them and are matched by the fee schedule, so "Corporate," with
 * a trailing comma has to be impossible to create rather than merely discouraged. Each entry is added
 * and removed as a whole thing.
 *
 * Local to this screen on purpose — it is used twice here and nowhere else. If a third use appears it
 * moves to `@hms/ui` (ADR-029).
 */
function TypeListEditor({
  label,
  hint,
  values,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  hint: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  const duplicate = values.some((v) => v.toLowerCase() === trimmed.toLowerCase());

  function add() {
    if (!trimmed || duplicate) return;
    onChange([...values, trimmed]);
    setDraft('');
  }

  return (
    <div>
      <p className="hms-label mb-1">{label}</p>
      <p className="mb-3 text-sm text-fg-muted">{hint}</p>
      {values.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {values.map((v) => (
            <li key={v}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 py-1 pl-3 pr-1.5 text-sm text-fg">
                {v}
                {!disabled && (
                  <button
                    type="button"
                    aria-label={`Remove ${v}`}
                    className="rounded-full p-0.5 text-fg-muted hover:bg-surface-3 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                    onClick={() => onChange(values.filter((x) => x !== v))}
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="flex items-end gap-2">
          <Field
            label={`Add a ${label.toLowerCase().replace(/s$/, '')}`}
            value={draft}
            maxLength={40}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            // Enter adds the entry rather than submitting the form — a half-typed word must not
            // save the whole page.
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            error={trimmed && duplicate ? 'Already in the list.' : undefined}
            className="flex-1"
          />
          <Button type="button" variant="secondary" onClick={add} disabled={!trimmed || duplicate}>
            <Plus size={16} strokeWidth={2} /> Add
          </Button>
        </div>
      )}
    </div>
  );
}

function WorkflowSettings() {
  const canManage = useCan(PERMISSIONS.WORKFLOW_CONFIG_MANAGE);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [scope, setScope] = useState<string>(ORG_SCOPE);
  const [config, setConfig] = useState<HospitalWorkflowConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Draft state, so nothing is written until Save.
  const [vitalsMode, setVitalsMode] = useState<VitalsMode>('consultation_only');
  const [paramStates, setParamStates] = useState<Record<VitalParameter, ParamState>>(
    () =>
      Object.fromEntries(VITAL_PARAMETERS.map((p) => [p, 'off'])) as Record<
        VitalParameter,
        ParamState
      >,
  );
  const [paymentTiming, setPaymentTiming] = useState<PaymentTiming>('before_consultation');
  const [consultationTypes, setConsultationTypes] = useState<string[]>([]);
  const [caseTypes, setCaseTypes] = useState<string[]>([]);

  useEffect(() => {
    api
      .listBranches()
      .then(setBranches)
      .catch(() => setBranches([]));
  }, []);

  const branchId = scope === ORG_SCOPE ? null : scope;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const c = await api.getWorkflowConfig(branchId);
      setConfig(c);
      setVitalsMode(c.vitalsMode);
      setPaymentTiming(c.paymentTiming);
      setConsultationTypes(c.consultationTypes);
      setCaseTypes(c.caseTypes);
      setParamStates(
        Object.fromEntries(
          VITAL_PARAMETERS.map((p) => [
            p,
            c.vitalsRequiredParams.includes(p)
              ? 'required'
              : c.vitalsOptionalParams.includes(p)
                ? 'optional'
                : 'off',
          ]),
        ) as Record<VitalParameter, ParamState>,
      );
    } catch (e) {
      setError(
        e instanceof api.ApiRequestError ? e.message : 'Could not load the workflow settings.',
      );
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const scopeOptions = useMemo(
    () => [
      {
        value: ORG_SCOPE,
        label: 'Whole organization',
        description: 'The default every hospital inherits',
      },
      ...branches.map((b) => ({
        value: b.id,
        label: b.name,
        description: 'Override for this hospital only',
      })),
    ],
    [branches],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateWorkflowConfig(branchId, {
        version: config.version,
        vitalsMode,
        vitalsRequiredParams: VITAL_PARAMETERS.filter((p) => paramStates[p] === 'required'),
        vitalsOptionalParams: VITAL_PARAMETERS.filter((p) => paramStates[p] === 'optional'),
        paymentTiming,
        consultationTypes,
        caseTypes,
      });
      setConfig(updated);
    } catch (err) {
      setError(
        err instanceof api.ApiRequestError ? err.message : 'Could not save the workflow settings.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Skeleton className="h-64" />;

  const vitalsOff = vitalsMode === 'disabled';

  return (
    <form className="flex max-w-3xl flex-col gap-5" onSubmit={handleSubmit}>
      {error && <Alert tone="danger">{error}</Alert>}

      <Card header="Which hospital these settings apply to">
        <Select
          label="Scope"
          value={scope}
          onChange={setScope}
          options={scopeOptions}
          searchable={branches.length > 7}
        />
        {config?.inheritedFromOrganization && (
          <Alert tone="neutral" className="mt-4">
            {config.branchName} has no settings of its own and is following the organization
            default. Saving here creates an override for {config.branchName} alone.
          </Alert>
        )}
        {config?.isDefault && (
          <Alert tone="neutral" className="mt-4">
            Nothing has been configured yet, so the platform defaults are shown: vitals in the
            consultation, and the fee settled before the consultation starts. That is exactly how
            the product behaves today.
          </Alert>
        )}
      </Card>

      <Card header="Vitals">
        <div className="flex flex-col gap-4">
          <Select
            label="Where vitals are recorded"
            value={vitalsMode}
            onChange={(v) => setVitalsMode(v as VitalsMode)}
            options={VITALS_MODE_OPTIONS}
            searchable={false}
            disabled={!canManage}
            hint="The doctor can always amend a reading during the consultation, whichever option is chosen."
          />

          {vitalsMode === 'after_checkin' && (
            <Alert tone="neutral">
              Patients appear on the <strong className="font-medium text-fg">Vitals queue</strong>{' '}
              after check-in, and move on to the consultation once their readings are taken. Staff
              who record them need the &ldquo;record vitals&rdquo; permission — receptionists and
              doctors have it by default.
            </Alert>
          )}

          <div>
            <p className="hms-label mb-1">Which vitals</p>
            <p className="mb-3 text-sm text-fg-muted">
              {vitalsOff
                ? 'Switched off — no vitals are collected anywhere in the workflow.'
                : 'A required vital must be entered before the form can be submitted. An offered one is shown but may be left blank.'}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {VITAL_PARAMETERS.map((p) => (
                <Select
                  key={p}
                  label={PARAM_LABELS[p]}
                  value={vitalsOff ? 'off' : paramStates[p]}
                  onChange={(v) => setParamStates((prev) => ({ ...prev, [p]: v as ParamState }))}
                  options={PARAM_STATE_OPTIONS}
                  searchable={false}
                  disabled={!canManage || vitalsOff}
                />
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card header="Consultation and case types">
        <p className="mb-4 text-sm text-fg-muted">
          Your own words for the kinds of consultation you offer and the kinds of case you treat
          under. Both are optional. Leave them empty and neither question is asked anywhere —
          nothing changes.
        </p>
        <div className="flex flex-col gap-6">
          <TypeListEditor
            label="Consultation types"
            hint="What kind of consultation this is. Offered as a field at check-in, and usable as a price in the fee schedule."
            placeholder="Teleconsultation, Procedure, Review…"
            values={consultationTypes}
            onChange={setConsultationTypes}
            disabled={!canManage}
          />
          <TypeListEditor
            label="Case types"
            hint="What kind of episode a treatment case is. Set once when the case is opened, and it prices every visit under it."
            placeholder="Corporate, Insurance, Camp, Medico-legal…"
            values={caseTypes}
            onChange={setCaseTypes}
            disabled={!canManage}
          />
        </div>
        <Alert tone="neutral" className="mt-4">
          Removing a type does not change any visit or case already recorded under it. If the fee
          schedule still prices that type, saving is refused until you retire the rule — otherwise
          the price would stay on the screen while never applying again.
        </Alert>
      </Card>

      <Card header="Payment">
        <Select
          label="When the consultation fee must be settled"
          value={paymentTiming}
          onChange={(v) => setPaymentTiming(v as PaymentTiming)}
          options={PAYMENT_TIMING_OPTIONS}
          searchable={false}
          disabled={!canManage}
        />
        {paymentTiming === 'after_consultation' && (
          <Alert tone="neutral" className="mt-4">
            The consultation will no longer wait for payment. The invoice is still raised at
            check-in and still has to be settled — nothing is written off, and the balance stays
            visible on the visit and in Billing.
          </Alert>
        )}
      </Card>

      {canManage && (
        <div className="flex items-center gap-3">
          <Button type="submit" loading={saving}>
            Save workflow settings
          </Button>
          {config && !config.isDefault && !config.inheritedFromOrganization && (
            <Badge tone="neutral">Version {config.version}</Badge>
          )}
        </div>
      )}
    </form>
  );
}

export default function WorkflowSettingsPage() {
  return (
    <RequirePermission perm={PERMISSIONS.WORKFLOW_CONFIG_VIEW}>
      <WorkflowSettings />
    </RequirePermission>
  );
}
