"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Card, Field, Spinner } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { Encounter, Icd10Code, SaveEncounterRequest } from "@hms/types";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";
import { PageHeader } from "../../../../components/PageHeader";

type DxRow = { icd10Code: string; icd10Term: string; isPrimary: boolean };
type RxRow = { drugName: string; dose: string; frequency: string; duration: string; route: string };
type LabRow = { testName: string; testCode: string; priority: string };

const VITAL_FIELDS: Array<{ key: string; label: string; step?: string }> = [
  { key: "systolic", label: "BP systolic" },
  { key: "diastolic", label: "BP diastolic" },
  { key: "pulse", label: "Pulse (bpm)" },
  { key: "spo2", label: "SpO₂ (%)" },
  { key: "respRate", label: "Resp. rate" },
  { key: "tempC", label: "Temp (°C)", step: "0.1" },
  { key: "weightKg", label: "Weight (kg)", step: "0.1" },
  { key: "heightCm", label: "Height (cm)" },
];

function numOrNull(s: string): number | null {
  const n = Number(s);
  return s.trim() === "" || Number.isNaN(n) ? null : n;
}

function Consultation({ visitId }: { visitId: string }) {
  const [enc, setEnc] = useState<Encounter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);

  const [chiefComplaint, setChiefComplaint] = useState("");
  const [soap, setSoap] = useState({ subjective: "", objective: "", assessment: "", plan: "" });
  const [vitals, setVitals] = useState<Record<string, string>>({});
  const [dx, setDx] = useState<DxRow[]>([]);
  const [rx, setRx] = useState<RxRow[]>([]);
  const [lab, setLab] = useState<LabRow[]>([]);

  const [icdQuery, setIcdQuery] = useState("");
  const [icdResults, setIcdResults] = useState<Icd10Code[]>([]);

  const signed = enc?.status === "signed";

  const hydrate = useCallback((e: Encounter) => {
    setEnc(e);
    setChiefComplaint(e.chiefComplaint ?? "");
    setSoap({ subjective: e.subjective ?? "", objective: e.objective ?? "", assessment: e.assessment ?? "", plan: e.plan ?? "" });
    const v = e.vitals;
    setVitals({
      systolic: v.systolic?.toString() ?? "",
      diastolic: v.diastolic?.toString() ?? "",
      pulse: v.pulse?.toString() ?? "",
      spo2: v.spo2?.toString() ?? "",
      respRate: v.respRate?.toString() ?? "",
      tempC: v.tempC?.toString() ?? "",
      weightKg: v.weightKg?.toString() ?? "",
      heightCm: v.heightCm?.toString() ?? "",
    });
    setDx(e.diagnoses.map((d) => ({ icd10Code: d.icd10Code, icd10Term: d.icd10Term, isPrimary: d.isPrimary })));
    setRx(e.prescriptions.map((p) => ({ drugName: p.drugName, dose: p.dose ?? "", frequency: p.frequency ?? "", duration: p.duration ?? "", route: p.route ?? "" })));
    setLab(e.labOrders.map((l) => ({ testName: l.testName, testCode: l.testCode ?? "", priority: l.priority })));
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .openEncounter(visitId)
      .then((e) => { hydrate(e); setError(null); })
      .catch((e) => setError(e instanceof api.ApiRequestError ? e.message : "Failed to open the consultation."))
      .finally(() => setLoading(false));
  }, [visitId, hydrate]);

  useEffect(() => {
    if (!icdQuery.trim()) { setIcdResults([]); return; }
    const t = setTimeout(() => { api.searchIcd10(icdQuery).then(setIcdResults).catch(() => setIcdResults([])); }, 250);
    return () => clearTimeout(t);
  }, [icdQuery]);

  function buildBody(): SaveEncounterRequest {
    return {
      version: enc!.version,
      chiefComplaint: chiefComplaint || null,
      subjective: soap.subjective || null,
      objective: soap.objective || null,
      assessment: soap.assessment || null,
      plan: soap.plan || null,
      vitals: {
        systolic: numOrNull(vitals.systolic ?? ""),
        diastolic: numOrNull(vitals.diastolic ?? ""),
        pulse: numOrNull(vitals.pulse ?? ""),
        spo2: numOrNull(vitals.spo2 ?? ""),
        respRate: numOrNull(vitals.respRate ?? ""),
        tempC: numOrNull(vitals.tempC ?? ""),
        weightKg: numOrNull(vitals.weightKg ?? ""),
        heightCm: numOrNull(vitals.heightCm ?? ""),
      },
      diagnoses: dx.map((d) => ({ icd10Code: d.icd10Code, icd10Term: d.icd10Term, isPrimary: d.isPrimary })),
      prescriptions: rx
        .filter((p) => p.drugName.trim())
        .map((p) => ({ drugName: p.drugName, dose: p.dose || null, frequency: p.frequency || null, duration: p.duration || null, route: p.route || null })),
      labOrders: lab
        .filter((l) => l.testName.trim())
        .map((l) => ({ testName: l.testName, testCode: l.testCode || null, priority: l.priority || "routine" })),
    };
  }

  async function save() {
    if (!enc) return;
    setSaving(true); setError(null);
    try {
      // Outcome is announced by the shared toast (ADR-026).
      hydrate(await api.saveEncounter(enc.id, buildBody()));
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setSaving(false);
    }
  }

  async function sign() {
    if (!enc) return;
    if (!window.confirm("Sign this consultation? It will be locked and the visit marked completed.")) return;
    setSigning(true); setError(null);
    try {
      await api.saveEncounter(enc.id, buildBody());
      hydrate(await api.signEncounter(enc.id));
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setSigning(false);
    }
  }

  function addDx(c: Icd10Code) {
    if (dx.some((d) => d.icd10Code === c.code)) return;
    setDx((prev) => [...prev, { icd10Code: c.code, icd10Term: c.term, isPrimary: prev.length === 0 }]);
    setIcdQuery("");
    setIcdResults([]);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-fg-muted">
        <Spinner /> Opening consultation…
      </div>
    );
  }
  if (!enc) return <Alert tone="danger">{error ?? "Could not open the consultation."}</Alert>;

  const disabled = signed;

  return (
    <>
      <Link href="/opd" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft size={15} strokeWidth={2} /> OPD queue
      </Link>
      <PageHeader
        title="Consultation"
        description={`${enc.patientName} · ${enc.patientUhid}${enc.providerName ? ` · ${enc.providerName}` : ""}`}
        actions={
          signed ? (
            <Badge tone="success">Signed {enc.signedAt ? new Date(enc.signedAt).toLocaleString() : ""}</Badge>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={save} loading={saving} disabled={signing}>Save</Button>
              <Button onClick={sign} loading={signing} disabled={saving}>Sign &amp; complete</Button>
            </div>
          )
        }
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <Card header="Vitals">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {VITAL_FIELDS.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              type="number"
              step={f.step}
              value={vitals[f.key] ?? ""}
              disabled={disabled}
              onChange={(e) => setVitals((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          ))}
        </div>
      </Card>

      <Card header="Notes (SOAP)">
        <div className="flex flex-col gap-4">
          <Field label="Chief complaint" value={chiefComplaint} disabled={disabled} onChange={(e) => setChiefComplaint(e.target.value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            {(["subjective", "objective", "assessment", "plan"] as const).map((k) => (
              <label key={k} className="hms-field">
                <span className="hms-label capitalize">{k}</span>
                <textarea
                  className="hms-input min-h-[80px]"
                  value={soap[k]}
                  disabled={disabled}
                  onChange={(e) => setSoap((s) => ({ ...s, [k]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        </div>
      </Card>

      <Card header="Diagnoses (ICD-10)">
        {!disabled && (
          <div className="relative mb-3">
            <Field placeholder="Search ICD-10 by code or term…" value={icdQuery} onChange={(e) => setIcdQuery(e.target.value)} />
            {icdResults.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-token border border-border bg-surface p-1">
                {icdResults.map((c) => (
                  <li key={c.code}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-token px-3 py-2 text-left text-sm hover:bg-surface-2"
                      onClick={() => addDx(c)}
                    >
                      <span className="font-mono text-xs text-brand">{c.code}</span>
                      <span className="text-fg">{c.term}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {dx.length === 0 ? (
          <p className="text-sm text-fg-subtle">No diagnoses added.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {dx.map((d, i) => (
              <li key={d.icd10Code} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-xs text-brand">{d.icd10Code}</span>
                <span className="text-fg">{d.icd10Term}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setDx((prev) => prev.map((x, j) => ({ ...x, isPrimary: j === i })))}
                  className={`ml-2 rounded-full px-2 py-0.5 text-xs ${d.isPrimary ? "bg-brand text-brand-fg" : "text-fg-muted hover:bg-surface-2"}`}
                >
                  Primary
                </button>
                {!disabled && (
                  <button type="button" className="ml-auto text-fg-subtle hover:text-danger" onClick={() => setDx((prev) => prev.filter((_, j) => j !== i))}>
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        header={
          <div className="flex items-center justify-between">
            <span>Prescriptions</span>
            {!disabled && (
              <Button variant="ghost" size="sm" onClick={() => setRx((p) => [...p, { drugName: "", dose: "", frequency: "", duration: "", route: "" }])}>
                <Plus size={15} /> Add
              </Button>
            )}
          </div>
        }
      >
        {rx.length === 0 ? (
          <p className="text-sm text-fg-subtle">No medications prescribed.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {rx.map((p, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <input className="hms-input col-span-2 sm:col-span-2" placeholder="Drug" value={p.drugName} disabled={disabled} onChange={(e) => setRx((prev) => prev.map((x, j) => (j === i ? { ...x, drugName: e.target.value } : x)))} />
                <input className="hms-input" placeholder="Dose" value={p.dose} disabled={disabled} onChange={(e) => setRx((prev) => prev.map((x, j) => (j === i ? { ...x, dose: e.target.value } : x)))} />
                <input className="hms-input" placeholder="Frequency" value={p.frequency} disabled={disabled} onChange={(e) => setRx((prev) => prev.map((x, j) => (j === i ? { ...x, frequency: e.target.value } : x)))} />
                <div className="flex items-center gap-1">
                  <input className="hms-input" placeholder="Duration" value={p.duration} disabled={disabled} onChange={(e) => setRx((prev) => prev.map((x, j) => (j === i ? { ...x, duration: e.target.value } : x)))} />
                  {!disabled && (
                    <button type="button" className="text-fg-subtle hover:text-danger" onClick={() => setRx((prev) => prev.filter((_, j) => j !== i))}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        header={
          <div className="flex items-center justify-between">
            <span>Lab orders</span>
            {!disabled && (
              <Button variant="ghost" size="sm" onClick={() => setLab((l) => [...l, { testName: "", testCode: "", priority: "routine" }])}>
                <Plus size={15} /> Add
              </Button>
            )}
          </div>
        }
      >
        {lab.length === 0 ? (
          <p className="text-sm text-fg-subtle">No lab tests ordered.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {lab.map((l, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <input className="hms-input col-span-2" placeholder="Test name" value={l.testName} disabled={disabled} onChange={(e) => setLab((prev) => prev.map((x, j) => (j === i ? { ...x, testName: e.target.value } : x)))} />
                <input className="hms-input" placeholder="Code" value={l.testCode} disabled={disabled} onChange={(e) => setLab((prev) => prev.map((x, j) => (j === i ? { ...x, testCode: e.target.value } : x)))} />
                <div className="flex items-center gap-1">
                  <select className="hms-input" value={l.priority} disabled={disabled} onChange={(e) => setLab((prev) => prev.map((x, j) => (j === i ? { ...x, priority: e.target.value } : x)))}>
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                  </select>
                  {!disabled && (
                    <button type="button" className="text-fg-subtle hover:text-danger" onClick={() => setLab((prev) => prev.filter((_, j) => j !== i))}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

export default function ConsultationPage() {
  const params = useParams<{ id: string }>();
  return (
    <RequirePermission perm={PERMISSIONS.EMR_VIEW}>
      <Consultation visitId={params.id} />
    </RequirePermission>
  );
}
