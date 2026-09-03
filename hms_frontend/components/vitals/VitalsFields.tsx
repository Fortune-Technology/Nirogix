'use client';

import { emptyLabel, Field, Select } from '@hms/ui';
import type { VitalParameter, Vitals, VitalsRecord, VitalsStage } from '@hms/types';

/** Where in the workflow a reading was taken. Shown beside it, because it changes how it reads. */
export const VITALS_STAGE_LABEL: Record<VitalsStage, string> = {
  check_in: 'At check-in',
  pre_consultation: 'Vitals room',
  consultation: 'In consultation',
};

/**
 * One line of readings. Used by the vitals queue and by the consultation, so the same set of
 * numbers is never abbreviated two different ways in one product.
 */
export function summariseVitals(v: VitalsRecord | null): string {
  if (!v) return emptyLabel('notRecorded');
  const parts: string[] = [];
  if (v.systolic != null && v.diastolic != null) parts.push(`${v.systolic}/${v.diastolic} mmHg`);
  if (v.pulse != null) parts.push(`${v.pulse} bpm`);
  if (v.spo2 != null) parts.push(`SpO₂ ${v.spo2}%`);
  if (v.respRate != null) parts.push(`${v.respRate}/min`);
  if (v.tempC != null) parts.push(`${v.tempC} °C`);
  if (v.weightKg != null) parts.push(`${v.weightKg} kg`);
  if (v.heightCm != null) parts.push(`${v.heightCm} cm`);
  if (v.bloodSugarMgDl != null) parts.push(`${v.bloodSugarMgDl} mg/dL`);
  return parts.length > 0 ? parts.join(' · ') : 'Recorded';
}

export type VitalsDraft = {
  [K in keyof Vitals]: string;
};

export const EMPTY_VITALS: VitalsDraft = {
  systolic: '',
  diastolic: '',
  pulse: '',
  spo2: '',
  respRate: '',
  tempC: '',
  weightKg: '',
  heightCm: '',
  bloodSugarMgDl: '',
  bloodSugarType: '',
};

const BLOOD_SUGAR_TYPES = [
  { value: 'fasting', label: 'Fasting' },
  { value: 'post_prandial', label: 'Post-prandial' },
  { value: 'random', label: 'Random' },
];

/**
 * Turns the form's strings into the API's numbers.
 *
 * A blank field is **not** zero — it means the reading was not taken, and a stored zero would be a
 * measurement nobody made (and, for a blood pressure or an oxygen saturation, an alarming one).
 * Anything that will not parse is dropped rather than sent as `NaN`.
 */
export function toVitalsPayload(draft: VitalsDraft): Partial<Vitals> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(draft)) {
    const value = raw.trim();
    if (!value) continue;
    if (key === 'bloodSugarType') {
      out[key] = value;
      continue;
    }
    const n = Number(value);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out as Partial<Vitals>;
}

/** True when the draft carries at least one actual reading. */
export function hasAnyReading(draft: VitalsDraft): boolean {
  return Object.entries(draft).some(
    ([key, value]) => key !== 'bloodSugarType' && value.trim() !== '',
  );
}

/**
 * The parameters this hospital has asked its staff to record, and which of them are mandatory.
 * A parameter in neither list is not shown at all — that is what "configurable" means here.
 */
export interface VitalsFieldsProps {
  value: VitalsDraft;
  onChange: (next: VitalsDraft) => void;
  required: readonly VitalParameter[];
  optional: readonly VitalParameter[];
  disabled?: boolean;
}

/**
 * The vitals form fields (ADR-113).
 *
 * One component for all three places a reading is taken — the check-in desk, the vitals queue and
 * the consultation — because the fields, the units and the validation must not differ by where the
 * staff member happens to be standing.
 *
 * Which fields appear comes from the hospital's configuration, never from the page. The server
 * enforces the same required list, so this is the affordance and not the boundary.
 */
export function VitalsFields({ value, onChange, required, optional, disabled }: VitalsFieldsProps) {
  const shown = new Set<VitalParameter>([...required, ...optional]);
  const isRequired = (p: VitalParameter) => required.includes(p);

  function set(key: keyof VitalsDraft, v: string) {
    onChange({ ...value, [key]: v });
  }

  if (shown.size === 0) {
    return (
      <p className="text-sm text-fg-muted">
        This hospital has not configured any vitals to record.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {shown.has('bloodPressure') && (
        // One control, two numbers: nobody records half a blood pressure, and the server refuses
        // one half without the other.
        <div className="hms-field sm:col-span-2">
          <span className="hms-label">
            Blood pressure (mmHg)
            {isRequired('bloodPressure') && <span className="text-danger"> *</span>}
          </span>
          <div className="flex items-center gap-2">
            <Field
              type="number"
              inputMode="numeric"
              placeholder="Systolic"
              aria-label="Systolic pressure"
              min={40}
              max={300}
              value={value.systolic}
              disabled={disabled}
              onChange={(e) => set('systolic', e.target.value)}
            />
            <span aria-hidden className="text-fg-muted">
              /
            </span>
            <Field
              type="number"
              inputMode="numeric"
              placeholder="Diastolic"
              aria-label="Diastolic pressure"
              min={20}
              max={200}
              value={value.diastolic}
              disabled={disabled}
              onChange={(e) => set('diastolic', e.target.value)}
            />
          </div>
        </div>
      )}

      {shown.has('pulse') && (
        <Field
          label={<>Pulse (bpm){isRequired('pulse') && <span className="text-danger"> *</span>}</>}
          type="number"
          inputMode="numeric"
          min={20}
          max={300}
          value={value.pulse}
          disabled={disabled}
          onChange={(e) => set('pulse', e.target.value)}
        />
      )}

      {shown.has('spo2') && (
        <Field
          label={<>SpO₂ (%){isRequired('spo2') && <span className="text-danger"> *</span>}</>}
          type="number"
          inputMode="numeric"
          min={50}
          max={100}
          value={value.spo2}
          disabled={disabled}
          onChange={(e) => set('spo2', e.target.value)}
        />
      )}

      {shown.has('respRate') && (
        <Field
          label={
            <>
              Respiratory rate (breaths/min)
              {isRequired('respRate') && <span className="text-danger"> *</span>}
            </>
          }
          type="number"
          inputMode="numeric"
          min={4}
          max={90}
          value={value.respRate}
          disabled={disabled}
          onChange={(e) => set('respRate', e.target.value)}
        />
      )}

      {shown.has('tempC') && (
        <Field
          label={
            <>Temperature (°C){isRequired('tempC') && <span className="text-danger"> *</span>}</>
          }
          type="number"
          inputMode="decimal"
          step="0.1"
          min={25}
          max={45}
          value={value.tempC}
          disabled={disabled}
          onChange={(e) => set('tempC', e.target.value)}
        />
      )}

      {shown.has('weightKg') && (
        <Field
          label={
            <>Weight (kg){isRequired('weightKg') && <span className="text-danger"> *</span>}</>
          }
          type="number"
          inputMode="decimal"
          step="0.1"
          min={0.3}
          max={400}
          value={value.weightKg}
          disabled={disabled}
          onChange={(e) => set('weightKg', e.target.value)}
        />
      )}

      {shown.has('heightCm') && (
        <Field
          label={
            <>Height (cm){isRequired('heightCm') && <span className="text-danger"> *</span>}</>
          }
          type="number"
          inputMode="numeric"
          min={20}
          max={260}
          value={value.heightCm}
          disabled={disabled}
          onChange={(e) => set('heightCm', e.target.value)}
        />
      )}

      {shown.has('bloodSugar') && (
        <>
          <Field
            label={
              <>
                Blood sugar (mg/dL)
                {isRequired('bloodSugar') && <span className="text-danger"> *</span>}
              </>
            }
            type="number"
            inputMode="numeric"
            min={10}
            max={900}
            value={value.bloodSugarMgDl}
            disabled={disabled}
            onChange={(e) => set('bloodSugarMgDl', e.target.value)}
          />
          {/* A sugar reading with no type is a number nobody can interpret, so the server insists
              on this whenever a value is entered. */}
          <Select
            label="Blood sugar reading"
            value={value.bloodSugarType}
            onChange={(v) => set('bloodSugarType', v)}
            options={BLOOD_SUGAR_TYPES}
            placeholder="Fasting, post-prandial or random"
            searchable={false}
            disabled={disabled}
            required={value.bloodSugarMgDl.trim() !== ''}
            clearable
          />
        </>
      )}
    </div>
  );
}
