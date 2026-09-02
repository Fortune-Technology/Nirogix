"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Mic, MicOff, Plus, Printer, Send, Sparkles, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Card, Field, Spinner } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type {
  Department,
  Drug,
  Encounter,
  EncounterSummary,
  HospitalWorkflowConfig,
  Icd10Code,
  LabTest,
  Provider,
  Referral,
  SaveEncounterRequest,
  Visit,
} from "@hms/types";
import { formatDate, formatDateTime, formatTime } from "@hms/utils";
import * as api from "../../../../lib/api";
import { RequirePermission, Can } from "../../../../components/Can";
import { PageHeader } from "../../../../components/PageHeader";
import { useCan } from "../../../../lib/auth";
import { formatPaise } from "../../../../lib/money";
import {
  EMPTY_VITALS,
  VITALS_STAGE_LABEL,
  VitalsFields,
  summariseVitals,
  toVitalsPayload,
  type VitalsDraft,
} from "../../../../components/vitals/VitalsFields";

/**
 * Voice dictation (ADR-070): the browser's own speech recognition appends into a text
 * field. Renders nothing when the browser has no engine — a feature that is absent,
 * never a dead button.
 */
function DictationButton({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const Ctor =
    typeof window !== "undefined"
      ? ((window as unknown as Record<string, unknown>).SpeechRecognition ??
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition)
      : undefined;
  if (!Ctor) return null;

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new (Ctor as any)();
    rec.lang = "en-IN";
    rec.continuous = true;
    rec.interimResults = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) onText(String(e.results[i][0].transcript).trim());
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={toggle}
      aria-label={listening ? "Stop dictation" : "Dictate"}
      className={`inline-flex items-center gap-1 rounded-token px-1.5 py-0.5 text-xs ${listening ? "bg-danger text-white" : "text-fg-muted hover:bg-surface-2"}`}
    >
      {listening ? <MicOff size={13} aria-hidden /> : <Mic size={13} aria-hidden />}
      {listening ? "Stop" : "Dictate"}
    </button>
  );
}

type DxRow = { icd10Code: string; icd10Term: string; isPrimary: boolean };
type RxRow = {
  id: string | null;
  drugId: string | null;
  drugName: string;
  dose: string;
  frequency: string;
  duration: string;
  route: string;
  instructions: string;
  status: string;
};
type LabRow = { id: string | null; testId: string | null; testName: string; testCode: string; priority: string; status: string };


// SOAP is the standard clinical note, but only to someone who was taught it — the four labels say
// nothing to a receptionist, a new junior, or the non-clinical staff who read these notes back.
// The hint carries the one distinction people actually get wrong: Subjective is what the patient
// claims, Objective is what the room measured, Assessment is the conclusion, Plan is the action.
const SOAP_HINT = {
  subjective: "What the patient tells you — symptoms, how long, what they have already taken",
  objective: "What you see and measure — examination findings, readings, report values",
  assessment: "What you think it is — working diagnosis, severity, what still needs ruling out",
  plan: "What happens next — tests, medicines, advice, when to review, when to come back sooner",
} as const;

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
  const [vitals, setVitals] = useState<VitalsDraft>(EMPTY_VITALS);
  // Which vitals this hospital collects, and which it insists on. A doctor amending one reading
  // is never held to the full required list — that is the desk's obligation, not a clinician's.
  const [workflow, setWorkflow] = useState<HospitalWorkflowConfig | null>(null);
  const [dx, setDx] = useState<DxRow[]>([]);
  const [rx, setRx] = useState<RxRow[]>([]);
  const [lab, setLab] = useState<LabRow[]>([]);

  const [icdQuery, setIcdQuery] = useState("");
  const [icdResults, setIcdResults] = useState<Icd10Code[]>([]);

  // Masters for the pickers: prescriptions link to the drug master, orders to the test
  // master — that link is what prices the lab order and pre-matches the pharmacy dispense.
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [labTests, setLabTests] = useState<LabTest[]>([]);
  const [history, setHistory] = useState<EncounterSummary[] | null>(null);
  // Context for the "fee unpaid" gate: which invoice to send the cashier to.
  const [visit, setVisit] = useState<Visit | null>(null);

  // Referral (ADR-068) + AI assist (ADR-070).
  const canRefer = useCan(PERMISSIONS.REFERRAL_CREATE);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [refDept, setRefDept] = useState("");
  const [refProvider, setRefProvider] = useState("");
  const [refReason, setRefReason] = useState("");
  const [referring, setReferring] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const signed = enc?.status === "signed";

  const hydrate = useCallback((e: Encounter) => {
    setEnc(e);
    setChiefComplaint(e.chiefComplaint ?? "");
    setSoap({ subjective: e.subjective ?? "", objective: e.objective ?? "", assessment: e.assessment ?? "", plan: e.plan ?? "" });
    // Seeded from the latest reading on the VISIT — which may be one the front desk or the vitals
    // room took, not one this encounter recorded. Saving an unchanged set writes nothing new.
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
      bloodSugarMgDl: v.bloodSugarMgDl?.toString() ?? "",
      bloodSugarType: v.bloodSugarType ?? "",
    });
    setDx(e.diagnoses.map((d) => ({ icd10Code: d.icd10Code, icd10Term: d.icd10Term, isPrimary: d.isPrimary })));
    setRx(
      e.prescriptions.map((p) => ({
        id: p.id,
        drugId: p.drugId,
        drugName: p.drugName,
        dose: p.dose ?? "",
        frequency: p.frequency ?? "",
        duration: p.duration ?? "",
        route: p.route ?? "",
        instructions: p.instructions ?? "",
        status: p.status,
      })),
    );
    setLab(
      e.labOrders.map((l) => ({
        id: l.id,
        testId: l.testId,
        testName: l.testName,
        testCode: l.testCode ?? "",
        priority: l.priority,
        status: l.status,
      })),
    );
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .openEncounter(visitId)
      .then((e) => { hydrate(e); setError(null); })
      .catch((e) => setError(e instanceof api.ApiRequestError ? e.message : "Failed to open the consultation."))
      .finally(() => setLoading(false));
    // Visit context regardless of the gate outcome — the unpaid message links to the bill.
    api.getVisit(visitId).then(setVisit).catch(() => setVisit(null));
  }, [visitId, hydrate]);

  useEffect(() => {
    api.listDrugs().then(setDrugs).catch(() => setDrugs([]));
    api.listLabTests().then(setLabTests).catch(() => setLabTests([]));
    api.aiCapabilities().then((c) => setAiEnabled(c.prescriptionDraft)).catch(() => setAiEnabled(false));
  }, []);

  useEffect(() => {
    if (!canRefer) return;
    api.listDepartments({ activeOnly: true }).then(setDepartments).catch(() => setDepartments([]));
    api.listProviders().then(setProviders).catch(() => setProviders([]));
  }, [canRefer]);

  const loadReferrals = useCallback(() => {
    if (!enc?.patientId) return;
    api
      .listReferrals({ patientId: enc.patientId })
      .then((rows) => setReferrals(rows.filter((r) => r.visitId === visitId)))
      .catch(() => setReferrals([]));
  }, [enc?.patientId, visitId]);

  useEffect(() => {
    loadReferrals();
  }, [loadReferrals]);

  async function refer() {
    if (!refDept || !refReason.trim()) return;
    setReferring(true);
    try {
      await api.createReferral({ visitId, toDepartmentId: refDept, toProviderId: refProvider || null, reason: refReason.trim() });
      setRefDept("");
      setRefProvider("");
      setRefReason("");
      loadReferrals();
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setReferring(false);
    }
  }

  // AI draft (ADR-070): fills the SAME rows the doctor could have typed — nothing is
  // saved until they review and press Save.
  async function draftWithAi() {
    setAiBusy(true);
    setAiNote(null);
    try {
      const vitalsSummary = Object.entries(vitals)
        .filter(([, v]) => String(v).trim() !== "")
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(", ");
      const res = await api.aiPrescriptionDraft({
        chiefComplaint: chiefComplaint || null,
        diagnoses: dx.map((d) => ({ icd10Code: d.icd10Code, icd10Term: d.icd10Term })),
        vitalsSummary: vitalsSummary || null,
      });
      setRx((prev) => [
        ...prev,
        ...res.prescriptions.map((p) => ({
          id: null,
          drugId: p.drugId,
          drugName: p.drugName,
          dose: p.dose ?? "",
          frequency: p.frequency ?? "",
          duration: p.duration ?? "",
          route: p.route ?? "",
          instructions: p.instructions ?? "",
          status: "ordered",
        })),
      ]);
      setAiNote(res.note);
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setAiBusy(false);
    }
  }

  // The patient's earlier signed consultations — the history the doctor consults from.
  useEffect(() => {
    if (!enc?.patientId) return;
    api
      .listPatientEncounters(enc.patientId)
      .then((rows) => setHistory(rows.filter((r) => r.visitId !== visitId)))
      .catch(() => setHistory([]));
  }, [enc?.patientId, visitId]);

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
        ...toVitalsPayload(vitals),
      },
      diagnoses: dx.map((d) => ({ icd10Code: d.icd10Code, icd10Term: d.icd10Term, isPrimary: d.isPrimary })),
      // Existing rows keep their id so the server updates in place; rows the pharmacy or lab
      // has already progressed are immutable server-side and never replaced by a re-save.
      prescriptions: rx
        .filter((p) => p.drugName.trim())
        .map((p) => ({
          id: p.id ?? undefined,
          drugId: p.drugId ?? null,
          drugName: p.drugName,
          dose: p.dose || null,
          frequency: p.frequency || null,
          duration: p.duration || null,
          route: p.route || null,
          instructions: p.instructions || null,
        })),
      labOrders: lab
        .filter((l) => l.testName.trim())
        .map((l) => ({
          id: l.id ?? undefined,
          testId: l.testId ?? null,
          testName: l.testName,
          testCode: l.testCode || null,
          priority: l.priority || "routine",
        })),
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
  if (!enc) {
    const unpaid = visit?.invoice && visit.invoice.balancePaise > 0;
    return (
      <>
        <Link href="/opd" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft size={15} strokeWidth={2} /> OPD queue
        </Link>
        <Alert tone={unpaid ? "neutral" : "danger"}>{error ?? "Could not open the consultation."}</Alert>
        {unpaid && visit?.invoice && (
          <Card header="Payment pending">
            <p className="text-sm text-fg-muted">
              {visit.patientName} · {visit.visitNumber}, balance {formatPaise(visit.invoice.balancePaise)} on invoice{" "}
              <span className="font-mono">{visit.invoice.invoiceNumber}</span>. The consultation opens once the fee is collected.
            </p>
            <div className="mt-3">
              <Link href={`/billing/${visit.invoice.id}`}>
                <Button size="sm">Collect payment</Button>
              </Link>
            </div>
          </Card>
        )}
      </>
    );
  }

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
            <div className="flex items-center gap-2">
              <Badge tone="success">Signed {formatDateTime(enc.signedAt, "")}</Badge>
              <Link href={`/print/prescription/${visitId}`}>
                <Button variant="secondary">
                  <Printer size={16} strokeWidth={2} /> Print prescription
                </Button>
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={save} loading={saving} disabled={signing}>Save</Button>
              <Button onClick={sign} loading={signing} disabled={saving}>Sign &amp; complete</Button>
            </div>
          )
        }
      />

      {error && <Alert tone="danger">{error}</Alert>}

      {workflow?.vitalsMode !== "disabled" && (
        <Card header="Vitals">
          {/* Readings taken earlier in the workflow, with who took each and when — a reading is
              read differently depending on where in the visit it was measured. */}
          {enc && enc.vitalsHistory.length > 0 && (
            <ul className="mb-4 flex flex-col gap-1 rounded-token border border-border bg-surface-2 p-3">
              {enc.vitalsHistory.slice(0, 4).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                  <Badge tone={r.stage === "consultation" ? "brand" : "neutral"}>{VITALS_STAGE_LABEL[r.stage]}</Badge>
                  <span className="text-fg">{summariseVitals(r)}</span>
                  <span className="ml-auto">
                    {r.recordedByName ? `${r.recordedByName} · ` : ""}
                    {formatTime(r.recordedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <VitalsFields
            value={vitals}
            onChange={setVitals}
            // A clinician is offered every parameter the hospital collects, none of them forced:
            // the required list exists so the DESK cannot skip a reading, and holding a doctor to
            // it would block them correcting one number.
            required={[]}
            optional={[...(workflow?.vitalsRequiredParams ?? []), ...(workflow?.vitalsOptionalParams ?? [])]}
            disabled={disabled}
          />
        </Card>
      )}

      <Card header="Notes (SOAP)">
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="hms-label">Chief complaint</span>
              {!disabled && <DictationButton onText={(t) => setChiefComplaint((v) => (v ? `${v} ${t}` : t))} />}
            </div>
            <input
              className="hms-input w-full"
              placeholder="In a few words — Fever, Chest pain, Diabetes follow-up"
              value={chiefComplaint}
              disabled={disabled}
              onChange={(e) => setChiefComplaint(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["subjective", "objective", "assessment", "plan"] as const).map((k) => (
              <div key={k}>
                <div className="flex items-center justify-between">
                  <span className="hms-label capitalize">{k}</span>
                  {!disabled && <DictationButton onText={(t) => setSoap((s) => ({ ...s, [k]: s[k] ? `${s[k]} ${t}` : t }))} />}
                </div>
                <textarea
                  className="hms-input min-h-[80px] w-full"
                  placeholder={SOAP_HINT[k]}
                  value={soap[k]}
                  disabled={disabled}
                  onChange={(e) => setSoap((s) => ({ ...s, [k]: e.target.value }))}
                />
              </div>
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
              <div className="flex items-center gap-1">
                {aiEnabled && (
                  <Button variant="ghost" size="sm" onClick={() => void draftWithAi()} loading={aiBusy}>
                    <Sparkles size={15} /> AI draft
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setRx((p) => [...p, { id: null, drugId: null, drugName: "", dose: "", frequency: "", duration: "", route: "", instructions: "", status: "ordered" }])
                  }
                >
                  <Plus size={15} /> Add
                </Button>
              </div>
            )}
          </div>
        }
      >
        {aiNote && (
          <Alert tone="neutral">
            AI note: {aiNote}. Every drafted line is a suggestion; review, correct and delete freely before saving.
          </Alert>
        )}
        {/* Pick from the drug master (typing filters the datalist) so the prescription
            carries drugId — pharmacy then dispenses the exact drug, not a name guess.
            Free text still works for an unstocked medicine. */}
        <datalist id="drug-master">
          {drugs.map((d) => (
            <option key={d.id} value={d.name}>{`${d.strength ?? ""} ${d.form ?? ""} · ${formatPaise(d.unitPricePaise)} · stock ${d.onHand}`}</option>
          ))}
        </datalist>
        {rx.length === 0 ? (
          <p className="text-sm text-fg-subtle">No medications prescribed.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {rx.map((p, i) => {
              // A row the pharmacy has already handled is clinical history — locked.
              const rowLocked = disabled || p.status !== "ordered";
              const matched = p.drugId ? drugs.find((d) => d.id === p.drugId) : undefined;
              return (
                <div key={p.id ?? `new-${i}`} className="rounded-token border border-border p-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                    <div className="col-span-2">
                      <input
                        className="hms-input w-full"
                        placeholder="Drug (pick or type)"
                        list="drug-master"
                        value={p.drugName}
                        disabled={rowLocked}
                        onChange={(e) => {
                          const name = e.target.value;
                          const hit = drugs.find((d) => d.name.toLowerCase() === name.trim().toLowerCase());
                          setRx((prev) => prev.map((x, j) => (j === i ? { ...x, drugName: name, drugId: hit?.id ?? null } : x)));
                        }}
                      />
                      <p className="mt-0.5 text-xs text-fg-subtle">
                        {p.status !== "ordered" ? (
                          <Badge tone={p.status === "dispensed" ? "success" : "neutral"}>{p.status}</Badge>
                        ) : matched ? (
                          `In stock: ${matched.onHand} · ${formatPaise(matched.unitPricePaise)}/${matched.unit}`
                        ) : p.drugName.trim() ? (
                          "Not in the drug master; pharmacy will match it by hand"
                        ) : (
                          ""
                        )}
                      </p>
                    </div>
                    <input className="hms-input" placeholder="Dose" value={p.dose} disabled={rowLocked} onChange={(e) => setRx((prev) => prev.map((x, j) => (j === i ? { ...x, dose: e.target.value } : x)))} />
                    <input className="hms-input" placeholder="Frequency (1-0-1)" value={p.frequency} disabled={rowLocked} onChange={(e) => setRx((prev) => prev.map((x, j) => (j === i ? { ...x, frequency: e.target.value } : x)))} />
                    <input className="hms-input" placeholder="Route (oral)" value={p.route} disabled={rowLocked} onChange={(e) => setRx((prev) => prev.map((x, j) => (j === i ? { ...x, route: e.target.value } : x)))} />
                    <div className="flex items-center gap-1">
                      <input className="hms-input" placeholder="Duration (5 days)" value={p.duration} disabled={rowLocked} onChange={(e) => setRx((prev) => prev.map((x, j) => (j === i ? { ...x, duration: e.target.value } : x)))} />
                      {!rowLocked && (
                        <button type="button" aria-label="Remove prescription" className="text-fg-subtle hover:text-danger" onClick={() => setRx((prev) => prev.filter((_, j) => j !== i))}>
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    className="hms-input mt-2 w-full"
                    placeholder="Instructions (after food…)"
                    value={p.instructions}
                    disabled={rowLocked}
                    onChange={(e) => setRx((prev) => prev.map((x, j) => (j === i ? { ...x, instructions: e.target.value } : x)))}
                  />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card
        header={
          <div className="flex items-center justify-between">
            <span>Lab orders</span>
            {!disabled && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLab((l) => [...l, { id: null, testId: null, testName: "", testCode: "", priority: "routine", status: "ordered" }])}
              >
                <Plus size={15} /> Add
              </Button>
            )}
          </div>
        }
      >
        {/* Pick from the test master so the order carries testId — that is what puts the
            lab charge on the bill at sample collection. Free text = unpriced until the
            technician matches it. */}
        <datalist id="lab-test-master">
          {labTests.map((t) => (
            <option key={t.id} value={t.name}>{`${t.code ?? ""} · ${formatPaise(t.pricePaise)}`}</option>
          ))}
        </datalist>
        {lab.length === 0 ? (
          <p className="text-sm text-fg-subtle">No lab tests ordered.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {lab.map((l, i) => {
              // Collected / resulted orders are in the lab's hands — locked here.
              const rowLocked = disabled || l.status !== "ordered";
              const matched = l.testId ? labTests.find((t) => t.id === l.testId) : undefined;
              return (
                <div key={l.id ?? `new-${i}`} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="col-span-2">
                    <input
                      className="hms-input w-full"
                      placeholder="Test (pick or type)"
                      list="lab-test-master"
                      value={l.testName}
                      disabled={rowLocked}
                      onChange={(e) => {
                        const name = e.target.value;
                        const hit = labTests.find((t) => t.name.toLowerCase() === name.trim().toLowerCase());
                        setLab((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, testName: name, testId: hit?.id ?? null, testCode: hit?.code ?? x.testCode } : x,
                          ),
                        );
                      }}
                    />
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      {l.status !== "ordered" ? (
                        <Badge tone={l.status === "resulted" ? "success" : "brand"}>{l.status}</Badge>
                      ) : matched ? (
                        `${formatPaise(matched.pricePaise)} · billed at sample collection`
                      ) : l.testName.trim() ? (
                        "Not in the test master; priced when the lab matches it"
                      ) : (
                        ""
                      )}
                    </p>
                  </div>
                  <input className="hms-input" placeholder="Code" value={l.testCode} disabled={rowLocked} onChange={(e) => setLab((prev) => prev.map((x, j) => (j === i ? { ...x, testCode: e.target.value } : x)))} />
                  <div className="flex items-center gap-1">
                    <select className="hms-input" value={l.priority} disabled={rowLocked} onChange={(e) => setLab((prev) => prev.map((x, j) => (j === i ? { ...x, priority: e.target.value } : x)))}>
                      <option value="routine">Routine</option>
                      <option value="urgent">Urgent</option>
                    </select>
                    {!rowLocked && (
                      <button type="button" aria-label="Remove lab order" className="text-fg-subtle hover:text-danger" onClick={() => setLab((prev) => prev.filter((_, j) => j !== i))}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {canRefer && (
        <Card header="Refer to a department">
          {referrals.length > 0 && (
            <ul className="mb-3 flex flex-col divide-y divide-border text-sm">
              {referrals.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <span className="font-medium text-fg">{r.toDepartmentName}</span>
                    {r.toProviderName && <span className="ml-2 text-fg-muted">{r.toProviderName}</span>}
                    <p className="truncate text-xs text-fg-muted">{r.reason}</p>
                  </div>
                  <Badge tone={r.status === "completed" ? "success" : r.status === "pending" ? "warning" : "neutral"}>{r.status}</Badge>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="hms-field">
              <span className="hms-label">Department</span>
              <select className="hms-input" value={refDept} onChange={(e) => setRefDept(e.target.value)}>
                <option value="">Choose…</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
            <label className="hms-field">
              <span className="hms-label">Doctor (optional)</span>
              <select className="hms-input" value={refProvider} onChange={(e) => setRefProvider(e.target.value)}>
                <option value="">Any</option>
                {providers.filter((p) => p.isActive).map((p) => (
                  <option key={p.id} value={p.id}>{p.fullName}</option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <span className="hms-label">Reason</span>
              <div className="flex items-center gap-2">
                <input className="hms-input w-full" placeholder="Why this department…" value={refReason} onChange={(e) => setRefReason(e.target.value)} />
                <Button size="sm" onClick={() => void refer()} loading={referring} disabled={!refDept || !refReason.trim()}>
                  <Send size={14} /> Refer
                </Button>
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-fg-subtle">
            The front desk checks the patient in against the referral. The receiving department opens this same chart.
          </p>
        </Card>
      )}

      <Card header={`Past consultations${history ? ` (${history.length})` : ""}`}>
        {!history ? (
          <div className="flex items-center gap-2 text-sm text-fg-muted"><Spinner /> Loading history…</div>
        ) : history.length === 0 ? (
          <p className="text-sm text-fg-subtle">No earlier signed consultations for this patient.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {history.slice(0, 8).map((h) => (
              <li key={h.id} className="py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/opd/${h.visitId}`} className="font-mono font-medium text-brand hover:underline">
                      {h.visitNumber}
                    </Link>
                    <span className="ml-2 text-fg-muted">{formatDate(h.visitDate)}</span>
                    {h.providerName && <span className="ml-2 text-fg-muted">{h.providerName}</span>}
                  </div>
                  <span className="shrink-0 text-xs text-fg-muted">{h.prescriptionCount} rx · {h.labOrderCount} lab</span>
                </div>
                {(h.chiefComplaint || h.diagnoses.length > 0) && (
                  <p className="mt-1 truncate text-fg-muted">
                    {h.chiefComplaint}
                    {h.chiefComplaint && h.diagnoses.length > 0 && " · "}
                    {h.diagnoses.map((d) => `${d.icd10Code} ${d.icd10Term}`).join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
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
