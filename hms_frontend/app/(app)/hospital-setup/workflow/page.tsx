"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Alert, Badge, Button, Card, Select, Skeleton } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import {
  VITAL_PARAMETERS,
  type Branch,
  type HospitalWorkflowConfig,
  type PaymentTiming,
  type VitalParameter,
  type VitalsMode,
} from "@hms/types";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";
import { useCan } from "../../../../lib/auth";

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
    value: "consultation_only",
    label: "In the consultation",
    description: "The doctor records vitals while seeing the patient. This is the default.",
  },
  {
    value: "during_checkin",
    label: "At the front desk, during check-in",
    description: "The receptionist records them on the check-in form itself.",
  },
  {
    value: "after_checkin",
    label: "In a separate vitals step, after check-in",
    description: "The patient joins a vitals queue; a nurse or assistant records them before the consultation.",
  },
  {
    value: "disabled",
    label: "Not at all",
    description: "This hospital does not record vitals.",
  },
];

const PAYMENT_TIMING_OPTIONS: Array<{ value: PaymentTiming; label: string; description: string }> = [
  {
    value: "before_consultation",
    label: "Before the consultation starts",
    description: "The doctor cannot open the consultation until the fee is settled. This is the default.",
  },
  {
    value: "at_checkin",
    label: "At the front desk, during check-in",
    description: "The same rule; the desk collects immediately rather than sending the patient to a counter.",
  },
  {
    value: "after_consultation",
    label: "After the consultation",
    description: "No gate — the patient is seen and settles on the way out. For employer or insurer billing.",
  },
];

const PARAM_LABELS: Record<VitalParameter, string> = {
  bloodPressure: "Blood pressure",
  pulse: "Pulse",
  spo2: "SpO₂",
  respRate: "Respiratory rate",
  tempC: "Temperature",
  weightKg: "Weight",
  heightCm: "Height",
  bloodSugar: "Blood sugar",
};

/** What a parameter is set to. Three states, because "offered" and "insisted on" are different. */
type ParamState = "off" | "optional" | "required";

const PARAM_STATE_OPTIONS = [
  { value: "off", label: "Not collected" },
  { value: "optional", label: "Offered" },
  { value: "required", label: "Required" },
];

const ORG_SCOPE = "__org__";

function WorkflowSettings() {
  const canManage = useCan(PERMISSIONS.WORKFLOW_CONFIG_MANAGE);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [scope, setScope] = useState<string>(ORG_SCOPE);
  const [config, setConfig] = useState<HospitalWorkflowConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Draft state, so nothing is written until Save.
  const [vitalsMode, setVitalsMode] = useState<VitalsMode>("consultation_only");
  const [paramStates, setParamStates] = useState<Record<VitalParameter, ParamState>>(
    () => Object.fromEntries(VITAL_PARAMETERS.map((p) => [p, "off"])) as Record<VitalParameter, ParamState>,
  );
  const [paymentTiming, setPaymentTiming] = useState<PaymentTiming>("before_consultation");

  useEffect(() => {
    api.listBranches().then(setBranches).catch(() => setBranches([]));
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
      setParamStates(
        Object.fromEntries(
          VITAL_PARAMETERS.map((p) => [
            p,
            c.vitalsRequiredParams.includes(p) ? "required" : c.vitalsOptionalParams.includes(p) ? "optional" : "off",
          ]),
        ) as Record<VitalParameter, ParamState>,
      );
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Could not load the workflow settings.");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const scopeOptions = useMemo(
    () => [
      { value: ORG_SCOPE, label: "Whole organization", description: "The default every hospital inherits" },
      ...branches.map((b) => ({ value: b.id, label: b.name, description: "Override for this hospital only" })),
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
        vitalsRequiredParams: VITAL_PARAMETERS.filter((p) => paramStates[p] === "required"),
        vitalsOptionalParams: VITAL_PARAMETERS.filter((p) => paramStates[p] === "optional"),
        paymentTiming,
      });
      setConfig(updated);
    } catch (err) {
      setError(err instanceof api.ApiRequestError ? err.message : "Could not save the workflow settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Skeleton className="h-64" />;

  const vitalsOff = vitalsMode === "disabled";

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
            {config.branchName} has no settings of its own and is following the organization default. Saving here
            creates an override for {config.branchName} alone.
          </Alert>
        )}
        {config?.isDefault && (
          <Alert tone="neutral" className="mt-4">
            Nothing has been configured yet, so the platform defaults are shown: vitals in the consultation, and the
            fee settled before the consultation starts. That is exactly how the product behaves today.
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

          {vitalsMode === "after_checkin" && (
            <Alert tone="neutral">
              Patients appear on the <strong className="font-medium text-fg">Vitals queue</strong> after check-in, and
              move on to the consultation once their readings are taken. Staff who record them need the
              &ldquo;record vitals&rdquo; permission — receptionists and doctors have it by default.
            </Alert>
          )}

          <div>
            <p className="hms-label mb-1">Which vitals</p>
            <p className="mb-3 text-sm text-fg-muted">
              {vitalsOff
                ? "Switched off — no vitals are collected anywhere in the workflow."
                : "A required vital must be entered before the form can be submitted. An offered one is shown but may be left blank."}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {VITAL_PARAMETERS.map((p) => (
                <Select
                  key={p}
                  label={PARAM_LABELS[p]}
                  value={vitalsOff ? "off" : paramStates[p]}
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

      <Card header="Payment">
        <Select
          label="When the consultation fee must be settled"
          value={paymentTiming}
          onChange={(v) => setPaymentTiming(v as PaymentTiming)}
          options={PAYMENT_TIMING_OPTIONS}
          searchable={false}
          disabled={!canManage}
        />
        {paymentTiming === "after_consultation" && (
          <Alert tone="neutral" className="mt-4">
            The consultation will no longer wait for payment. The invoice is still raised at check-in and still has to
            be settled — nothing is written off, and the balance stays visible on the visit and in Billing.
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
