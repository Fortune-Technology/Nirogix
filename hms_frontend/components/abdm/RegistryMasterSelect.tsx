"use client";

import { useEffect, useRef, useState } from "react";
import * as api from "../../lib/api";

/**
 * A dropdown whose options come from the national registry (ADR-096, HFR-014…038).
 *
 * The HFR registration form has around twenty of these — states, districts, sub-districts, facility
 * type and sub-type, ownership and its two subtypes, systems of medicine, specialities, working
 * days, operational status, address-proof types. Written once, per ADR-029, because twenty
 * hand-rolled fetch-and-render blocks is twenty places for the same bug.
 *
 * Three behaviours are the reason this is a component and not a hook:
 *
 * - **A dependent list clears its value when its parent changes.** Pick Karnataka, choose a
 *   district, then switch to Kerala: the old district code is now wrong but would still be sitting
 *   in the form, and it would be submitted. It is cleared, not merely re-fetched.
 * - **A list that fails to load says so instead of rendering empty.** An empty dropdown looks like
 *   "this hospital has no options" rather than "the registry did not answer", and an administrator
 *   cannot tell the difference. Registration takes weeks; a silently skipped mandatory field is
 *   found at the far end of that.
 * - **A value already saved survives a list that has not loaded yet.** Reopening a draft must not
 *   quietly drop a selection because the options are still in flight.
 */

export interface RegistryMasterSelectProps {
  label: string;
  /** Which registry list to read. */
  kind: api.AbdmFacilityMasterKind;
  /** For `masterData`, which list — `OWNER`, `MEDICINE`, `WORKING-DAYS`, `ADDRESS-PROOF`, … */
  type?: string;
  /**
   * What this list is scoped by. `code` for an LGD child list; the named filters for HFR's POST
   * lists — `facilityType` needs BOTH `ownershipCode` and `systemOfMedicineCode`, which is why
   * this is an object rather than a single parent code.
   */
  filters?: api.AbdmFacilityMasterParams;
  /** Copy shown when there is no parent yet — "Choose a state first" beats an empty box. */
  parentHint?: string;
  value: string;
  onChange: (code: string) => void;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  placeholder?: string;
  id?: string;
}

export function RegistryMasterSelect({
  label,
  kind,
  type,
  filters,
  parentHint = "Choose the field above first",
  value,
  onChange,
  required,
  disabled,
  hint,
  placeholder = "Select…",
  id,
}: RegistryMasterSelectProps) {
  const [options, setOptions] = useState<api.AbdmMasterOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const fieldId = id ?? `master-${kind}-${type ?? "all"}`;

  /**
   * Which filters this list cannot be read without, taken from the published HFR contract.
   *
   * Getting this wrong is invisible rather than loud: a POST list called without its filter returns
   * nothing, so the dropdown is simply empty and the form gives no clue which field above it is
   * responsible. Naming the dependency here is what lets the picker say so.
   */
  const REQUIRED: Partial<Record<api.AbdmFacilityMasterKind, Array<keyof api.AbdmFacilityMasterParams>>> = {
    districts: ["code"],
    subDistricts: ["code"],
    facilityType: ["ownershipCode", "systemOfMedicineCode"],
    facilitySubType: ["facilityTypeCode"],
    ownerSubtype: ["ownershipCode", "ownerSubtypeCode"],
    specialities: ["systemOfMedicineCode"],
  };

  const requiredFilters = REQUIRED[kind] ?? [];
  const missing = requiredFilters.filter((f) => !filters?.[f]);
  const blocked = missing.length > 0;
  // One stable string for the whole filter set, so the effects below depend on the values rather
  // than on an object identity a parent recreates every render.
  const filterKey = JSON.stringify(
    Object.fromEntries(Object.entries(filters ?? {}).filter(([, v]) => v)),
  );
  const previousFilters = useRef<string | undefined>(filterKey);

  useEffect(() => {
    // A change of scope invalidates the selection: pick Karnataka, choose a district, switch to
    // Kerala — the old district code is now wrong but would still be submitted. Cleared, not
    // merely re-fetched. The `undefined` check keeps a reopened draft's saved value on first render.
    if (requiredFilters.length > 0 && previousFilters.current !== undefined && previousFilters.current !== filterKey) {
      onChange("");
    }
    previousFilters.current = filterKey;
    // `onChange` is intentionally excluded: a parent-supplied inline arrow changes identity every
    // render and would clear the field continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    if (blocked) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    api
      .abdmFacilityMaster(kind, { ...filters, type })
      .then((list) => {
        if (!cancelled) setOptions(list);
      })
      .catch(() => {
        // Never a toast: a form with twenty of these would raise twenty for one outage (ADR-057).
        // The field reports its own failure, in place, where the fix is.
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, type, filterKey, blocked]);

  const blockedByParent = blocked;
  // A saved code whose list has not arrived is still the answer — render it rather than lose it.
  const valueMissingFromList = value && !options.some((o) => o.code === value);

  return (
    <div className="hms-field">
      <label className="hms-label" htmlFor={fieldId}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
        {required ? <span className="hms-visually-hidden"> (required)</span> : null}
      </label>
      <select
        id={fieldId}
        className="hms-input"
        value={value}
        required={required}
        disabled={disabled || blockedByParent || loading}
        aria-invalid={failed || undefined}
        aria-describedby={`${fieldId}-msg`}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{loading ? "Loading…" : placeholder}</option>
        {valueMissingFromList ? <option value={value}>{value}</option> : null}
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.label}
          </option>
        ))}
      </select>
      <span id={`${fieldId}-msg`} className={failed ? "hms-field__error" : "hms-field__hint"}>
        {failed
          ? "The registry did not return this list. Try again shortly — do not submit with it blank."
          : blockedByParent
            ? parentHint
            : !loading && options.length === 0
              ? "The registry returned no options for this list."
              : (hint ?? "")}
      </span>
    </div>
  );
}
