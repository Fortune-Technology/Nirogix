'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  FilePenLine,
  Mic,
  MicOff,
  Plus,
  Printer,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Combobox,
  ConfirmDialog,
  Dialog,
  Field,
  Select,
  Spinner,
  type ComboboxOption,
} from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
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
} from '@hms/types';
import { formatDate, formatDateTime, formatTime } from '@hms/utils';
import * as api from '../../../../lib/api';
import { RequirePermission, Can } from '../../../../components/Can';
import { PageHeader } from '../../../../components/PageHeader';
import { useCan } from '../../../../lib/auth';
import { formatPaise } from '../../../../lib/money';
import {
  EMPTY_VITALS,
  VITALS_STAGE_LABEL,
  VitalsFields,
  summariseVitals,
  toVitalsPayload,
  type VitalsDraft,
} from '../../../../components/vitals/VitalsFields';

/**
 * Voice dictation (ADR-070): the browser's own speech recognition appends into a text
 * field. Renders nothing when the browser has no engine — a feature that is absent,
 * never a dead button.
 */
function DictationButton({
  onText,
  disabled,
}: {
  onText: (text: string) => void;
  disabled?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const Ctor =
    typeof window !== 'undefined'
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
    rec.lang = 'en-IN';
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
      aria-label={listening ? 'Stop dictation' : 'Dictate'}
      className={`inline-flex items-center gap-1 rounded-token px-1.5 py-0.5 text-xs ${listening ? 'bg-danger text-white' : 'text-fg-muted hover:bg-surface-2'}`}
    >
      {listening ? <MicOff size={13} aria-hidden /> : <Mic size={13} aria-hidden />}
      {listening ? 'Stop' : 'Dictate'}
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
type LabRow = {
  id: string | null;
  testId: string | null;
  testName: string;
  testCode: string;
  priority: string;
  status: string;
};

/** What a confirmation is currently being asked about. `null` = no dialog open. */
type Pending =
  | { kind: 'sign' }
  | { kind: 'amend-cancel' }
  | { kind: 'rx'; index: number; name: string }
  | { kind: 'lab'; index: number; name: string }
  | { kind: 'dx'; index: number; name: string };

// SOAP is the standard clinical note, but only to someone who was taught it — the four labels say
// nothing to a receptionist, a new junior, or the non-clinical staff who read these notes back.
// The hint carries the one distinction people actually get wrong: Subjective is what the patient
// claims, Objective is what the room measured, Assessment is the conclusion, Plan is the action.
const SOAP_HINT = {
  subjective: 'What the patient tells you — symptoms, how long, what they have already taken',
  objective: 'What you see and measure — examination findings, readings, report values',
  assessment: 'What you think it is — working diagnosis, severity, what still needs ruling out',
  plan: 'What happens next — tests, medicines, advice, when to review, when to come back sooner',
} as const;

/** What an amendment's `changedFields` are called on screen. */
const FIELD_LABEL: Record<string, string> = {
  chiefComplaint: 'Chief complaint',
  subjective: 'Subjective',
  objective: 'Objective',
  assessment: 'Assessment',
  plan: 'Plan',
  diagnoses: 'Diagnoses',
  prescriptions: 'Prescriptions',
  labOrders: 'Lab orders',
};

// Suggestions, not a closed list: these are what a doctor types dozens of times a day, and the
// one they need next is always the one an enumeration would have left out. Free text still wins.
const ROUTE_SUGGESTIONS: ComboboxOption[] = [
  { value: 'oral', label: 'Oral', description: 'By mouth' },
  { value: 'iv', label: 'IV', description: 'Intravenous' },
  { value: 'im', label: 'IM', description: 'Intramuscular' },
  { value: 'sc', label: 'SC', description: 'Subcutaneous' },
  { value: 'topical', label: 'Topical' },
  { value: 'inhalation', label: 'Inhalation' },
  { value: 'sublingual', label: 'Sublingual' },
  { value: 'rectal', label: 'Rectal' },
  { value: 'ophthalmic', label: 'Ophthalmic', description: 'Eye' },
  { value: 'otic', label: 'Otic', description: 'Ear' },
  { value: 'nasal', label: 'Nasal' },
];

const FREQUENCY_SUGGESTIONS: ComboboxOption[] = [
  { value: '1-0-0', label: '1-0-0', description: 'Morning only', keywords: 'od once daily' },
  { value: '0-0-1', label: '0-0-1', description: 'Night only', keywords: 'hs bedtime' },
  { value: '1-0-1', label: '1-0-1', description: 'Morning and night', keywords: 'bd twice' },
  { value: '1-1-1', label: '1-1-1', description: 'Three times a day', keywords: 'tds tid thrice' },
  { value: '1-1-1-1', label: '1-1-1-1', description: 'Four times a day', keywords: 'qid' },
  { value: 'OD', label: 'OD', description: 'Once daily' },
  { value: 'BD', label: 'BD', description: 'Twice daily' },
  { value: 'TDS', label: 'TDS', description: 'Three times daily' },
  { value: 'QID', label: 'QID', description: 'Four times daily' },
  { value: 'HS', label: 'HS', description: 'At bedtime' },
  { value: 'SOS', label: 'SOS', description: 'When required' },
  { value: 'STAT', label: 'STAT', description: 'Immediately, once' },
];

/**
 * Everything the doctor can change, as one comparable value.
 *
 * This is what "unsaved changes" means on this screen — compared against the same shape taken
 * from the server's last answer. Deriving it from the form state rather than tracking a dirty
 * flag per field means a value typed and then typed back is correctly *not* a change.
 */
function formSnapshot(parts: {
  chiefComplaint: string;
  soap: { subjective: string; objective: string; assessment: string; plan: string };
  vitals: VitalsDraft;
  dx: DxRow[];
  rx: RxRow[];
  lab: LabRow[];
}): string {
  return JSON.stringify({
    chiefComplaint: parts.chiefComplaint.trim(),
    soap: {
      subjective: parts.soap.subjective.trim(),
      objective: parts.soap.objective.trim(),
      assessment: parts.soap.assessment.trim(),
      plan: parts.soap.plan.trim(),
    },
    vitals: toVitalsPayload(parts.vitals),
    dx: parts.dx,
    rx: parts.rx.map((p) => ({
      id: p.id,
      drugId: p.drugId,
      drugName: p.drugName.trim(),
      dose: p.dose.trim(),
      frequency: p.frequency.trim(),
      duration: p.duration.trim(),
      route: p.route.trim(),
      instructions: p.instructions.trim(),
    })),
    lab: parts.lab.map((l) => ({
      id: l.id,
      testId: l.testId,
      testName: l.testName.trim(),
      testCode: l.testCode.trim(),
      priority: l.priority,
    })),
  });
}

function Consultation({ visitId }: { visitId: string }) {
  const [enc, setEnc] = useState<Encounter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);
  const [amending, setAmending] = useState(false);

  const [chiefComplaint, setChiefComplaint] = useState('');
  const [soap, setSoap] = useState({ subjective: '', objective: '', assessment: '', plan: '' });
  const [vitals, setVitals] = useState<VitalsDraft>(EMPTY_VITALS);
  // Which vitals this hospital collects, and which it insists on. A doctor amending one reading
  // is never held to the full required list — that is the desk's obligation, not a clinician's.
  const [workflow, setWorkflow] = useState<HospitalWorkflowConfig | null>(null);
  const [dx, setDx] = useState<DxRow[]>([]);
  const [rx, setRx] = useState<RxRow[]>([]);
  const [lab, setLab] = useState<LabRow[]>([]);

  const [icdQuery, setIcdQuery] = useState('');
  const [icdResults, setIcdResults] = useState<Icd10Code[]>([]);
  const [icdSearching, setIcdSearching] = useState(false);

  // The content of the last server answer, for "are there unsaved changes?".
  const [savedSnapshot, setSavedSnapshot] = useState('');
  // What a confirmation is being asked about, and the reason text for an amendment.
  const [pending, setPending] = useState<Pending | null>(null);
  const [amendPromptOpen, setAmendPromptOpen] = useState(false);
  const [amendReason, setAmendReason] = useState('');
  const [amendError, setAmendError] = useState<string | null>(null);

  // Masters for the pickers: prescriptions link to the drug master, orders to the test
  // master — that link is what prices the lab order and pre-matches the pharmacy dispense.
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [labTests, setLabTests] = useState<LabTest[]>([]);
  const [mastersLoading, setMastersLoading] = useState(true);
  const [history, setHistory] = useState<EncounterSummary[] | null>(null);
  // Context for the "fee unpaid" gate: which invoice to send the cashier to.
  const [visit, setVisit] = useState<Visit | null>(null);

  // Referral (ADR-068) + AI assist (ADR-070).
  const canRefer = useCan(PERMISSIONS.REFERRAL_CREATE);
  const canAmend = useCan(PERMISSIONS.EMR_AMEND);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [refDept, setRefDept] = useState('');
  const [refProvider, setRefProvider] = useState('');
  const [refReason, setRefReason] = useState('');
  const [referring, setReferring] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  // `signed` is locked; `amending` is a signed note deliberately reopened (ADR-134) and edits
  // exactly like a draft. Only the first is read-only.
  const locked = enc?.status === 'signed';
  const inAmendment = enc?.status === 'amending';

  // One request at a time, whatever the button does. `saving` disables the button on the next
  // render, which is one render too late for a double-click — this closes that window.
  const busyRef = useRef(false);

  const hydrate = useCallback((e: Encounter) => {
    const nextSoap = {
      subjective: e.subjective ?? '',
      objective: e.objective ?? '',
      assessment: e.assessment ?? '',
      plan: e.plan ?? '',
    };
    // Seeded from the latest reading on the VISIT — which may be one the front desk or the vitals
    // room took, not one this encounter recorded. Saving an unchanged set writes nothing new.
    const v = e.vitals;
    const nextVitals: VitalsDraft = {
      systolic: v.systolic?.toString() ?? '',
      diastolic: v.diastolic?.toString() ?? '',
      pulse: v.pulse?.toString() ?? '',
      spo2: v.spo2?.toString() ?? '',
      respRate: v.respRate?.toString() ?? '',
      tempC: v.tempC?.toString() ?? '',
      weightKg: v.weightKg?.toString() ?? '',
      heightCm: v.heightCm?.toString() ?? '',
      bloodSugarMgDl: v.bloodSugarMgDl?.toString() ?? '',
      bloodSugarType: v.bloodSugarType ?? '',
    };
    const nextDx = e.diagnoses.map((d) => ({
      icd10Code: d.icd10Code,
      icd10Term: d.icd10Term,
      isPrimary: d.isPrimary,
    }));
    const nextRx = e.prescriptions.map((p) => ({
      id: p.id,
      drugId: p.drugId,
      drugName: p.drugName,
      dose: p.dose ?? '',
      frequency: p.frequency ?? '',
      duration: p.duration ?? '',
      route: p.route ?? '',
      instructions: p.instructions ?? '',
      status: p.status,
    }));
    const nextLab = e.labOrders.map((l) => ({
      id: l.id,
      testId: l.testId,
      testName: l.testName,
      testCode: l.testCode ?? '',
      priority: l.priority,
      status: l.status,
    }));

    setEnc(e);
    setChiefComplaint(e.chiefComplaint ?? '');
    setSoap(nextSoap);
    setVitals(nextVitals);
    setDx(nextDx);
    setRx(nextRx);
    setLab(nextLab);
    // Taken from the SAME values that were just written into state, so the screen can never
    // start out claiming unsaved changes it does not have.
    setSavedSnapshot(
      formSnapshot({
        chiefComplaint: e.chiefComplaint ?? '',
        soap: nextSoap,
        vitals: nextVitals,
        dx: nextDx,
        rx: nextRx,
        lab: nextLab,
      }),
    );
  }, []);

  const currentSnapshot = useMemo(
    () => formSnapshot({ chiefComplaint, soap, vitals, dx, rx, lab }),
    [chiefComplaint, soap, vitals, dx, rx, lab],
  );
  const dirty = enc !== null && !locked && currentSnapshot !== savedSnapshot;

  // A reload or a closed tab is the one navigation the browser lets us interrupt. In-app
  // navigation is not guarded here; the header states the unsaved count instead, permanently
  // in view because the header is sticky.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    setLoading(true);
    api
      .openEncounter(visitId)
      .then((e) => {
        hydrate(e);
        setError(null);
      })
      .catch((e) =>
        setError(e instanceof api.ApiRequestError ? e.message : 'Failed to open the consultation.'),
      )
      .finally(() => setLoading(false));
    // Visit context regardless of the gate outcome — the unpaid message links to the bill.
    api
      .getVisit(visitId)
      .then(setVisit)
      .catch(() => setVisit(null));
  }, [visitId, hydrate]);

  useEffect(() => {
    setMastersLoading(true);
    Promise.all([
      api
        .listDrugs()
        .then(setDrugs)
        .catch(() => setDrugs([])),
      api
        .listLabTests()
        .then(setLabTests)
        .catch(() => setLabTests([])),
    ]).finally(() => setMastersLoading(false));
    api
      .aiCapabilities()
      .then((c) => setAiEnabled(c.prescriptionDraft))
      .catch(() => setAiEnabled(false));
    // Which vitals this hospital records, and whether it runs a separate vitals step at all
    // (ADR-129 — the doctor holds the read key precisely so this screen can be built from it).
    // Without it the Vitals card claimed the hospital had configured nothing.
    api
      .getWorkflowConfig()
      .then(setWorkflow)
      .catch(() => setWorkflow(null));
  }, []);

  useEffect(() => {
    if (!canRefer) return;
    api
      .listDepartments({ activeOnly: true })
      .then(setDepartments)
      .catch(() => setDepartments([]));
    api
      .listProviders()
      .then(setProviders)
      .catch(() => setProviders([]));
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
      await api.createReferral({
        visitId,
        toDepartmentId: refDept,
        toProviderId: refProvider || null,
        reason: refReason.trim(),
      });
      setRefDept('');
      setRefProvider('');
      setRefReason('');
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
        .filter(([, v]) => String(v).trim() !== '')
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(', ');
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
          dose: p.dose ?? '',
          frequency: p.frequency ?? '',
          duration: p.duration ?? '',
          route: p.route ?? '',
          instructions: p.instructions ?? '',
          status: 'ordered',
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
    if (!icdQuery.trim()) {
      setIcdResults([]);
      setIcdSearching(false);
      return;
    }
    setIcdSearching(true);
    const t = setTimeout(() => {
      api
        .searchIcd10(icdQuery)
        .then(setIcdResults)
        .catch(() => setIcdResults([]))
        .finally(() => setIcdSearching(false));
    }, 250);
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
      diagnoses: dx.map((d) => ({
        icd10Code: d.icd10Code,
        icd10Term: d.icd10Term,
        isPrimary: d.isPrimary,
      })),
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
          priority: l.priority || 'routine',
        })),
    };
  }

  // Rows a doctor started and left blank are dropped by `buildBody`, so the screen says so
  // before the save rather than letting them silently disappear from the saved note.
  const blankRxCount = rx.filter((p) => !p.drugName.trim()).length;
  const blankLabCount = lab.filter((l) => !l.testName.trim()).length;

  async function save(): Promise<boolean> {
    if (!enc || busyRef.current) return false;
    busyRef.current = true;
    setSaving(true);
    setError(null);
    try {
      // Outcome is announced by the shared toast (ADR-026).
      hydrate(await api.saveEncounter(enc.id, buildBody()));
      return true;
    } catch {
      /* reported by the shared API-feedback layer */
      return false;
    } finally {
      setSaving(false);
      busyRef.current = false;
    }
  }

  async function sign() {
    if (!enc || busyRef.current) return;
    busyRef.current = true;
    setSigning(true);
    setError(null);
    try {
      // Save first so the signature locks what is on screen, not a stale server copy. A failed
      // save must abort the signature — signing over it would lock the wrong note.
      const saved = await api.saveEncounter(enc.id, buildBody());
      hydrate(await api.signEncounter(saved.id));
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setSigning(false);
      busyRef.current = false;
    }
  }

  async function beginAmendment() {
    if (!enc || busyRef.current) return;
    const reason = amendReason.trim();
    if (reason.length < 10) {
      setAmendError('Say why the signed record is being corrected — at least 10 characters.');
      return;
    }
    busyRef.current = true;
    setAmending(true);
    setAmendError(null);
    try {
      hydrate(await api.amendEncounter(enc.id, { reason }));
      setAmendPromptOpen(false);
      setAmendReason('');
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setAmending(false);
      busyRef.current = false;
    }
  }

  async function discardAmendment() {
    if (!enc || busyRef.current) return;
    busyRef.current = true;
    setAmending(true);
    try {
      hydrate(await api.cancelEncounterAmendment(enc.id));
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setAmending(false);
      busyRef.current = false;
    }
  }

  function addDx(code: string, term: string) {
    if (dx.some((d) => d.icd10Code === code)) return;
    setDx((prev) => [...prev, { icd10Code: code, icd10Term: term, isPrimary: prev.length === 0 }]);
    setIcdQuery('');
    setIcdResults([]);
  }

  /**
   * Removing a row that the server already holds is a change to the record and confirms;
   * removing one the doctor added a moment ago and has not saved is not, and a dialog there
   * would be noise on the way to a corrected line.
   */
  function removeRx(index: number) {
    const row = rx[index];
    if (row?.id) setPending({ kind: 'rx', index, name: row.drugName || 'this medicine' });
    else setRx((prev) => prev.filter((_, j) => j !== index));
  }
  function removeLab(index: number) {
    const row = lab[index];
    if (row?.id) setPending({ kind: 'lab', index, name: row.testName || 'this test' });
    else setLab((prev) => prev.filter((_, j) => j !== index));
  }

  function confirmPending() {
    if (!pending) return;
    switch (pending.kind) {
      case 'sign':
        setPending(null);
        void sign();
        return;
      case 'amend-cancel':
        setPending(null);
        void discardAmendment();
        return;
      case 'rx':
        setRx((prev) => prev.filter((_, j) => j !== pending.index));
        break;
      case 'lab':
        setLab((prev) => prev.filter((_, j) => j !== pending.index));
        break;
      case 'dx':
        setDx((prev) => prev.filter((_, j) => j !== pending.index));
        break;
    }
    setPending(null);
  }

  const drugOptions: ComboboxOption[] = useMemo(
    () =>
      drugs.map((d) => ({
        value: d.id,
        label: d.name,
        description: [d.strength, d.form].filter(Boolean).join(' ') || undefined,
        meta: `${formatPaise(d.unitPricePaise)} · ${d.onHand} in stock`,
      })),
    [drugs],
  );

  const labTestOptions: ComboboxOption[] = useMemo(
    () =>
      labTests.map((t) => ({
        value: t.id,
        label: t.name,
        description: t.code ?? undefined,
        keywords: t.code ?? undefined,
        meta: formatPaise(t.pricePaise),
      })),
    [labTests],
  );

  const icdOptions: ComboboxOption[] = useMemo(
    () =>
      icdResults.map((c) => ({
        value: c.code,
        label: c.term,
        description: c.code,
        keywords: c.code,
      })),
    [icdResults],
  );

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
        <Link
          href="/opd"
          className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
        >
          <ArrowLeft size={15} strokeWidth={2} /> OPD queue
        </Link>
        <Alert tone={unpaid ? 'neutral' : 'danger'}>
          {error ?? 'Could not open the consultation.'}
        </Alert>
        {unpaid && visit?.invoice && (
          <Card header="Payment pending">
            <p className="text-sm text-fg-muted">
              {visit.patientName} · {visit.visitNumber}, balance{' '}
              {formatPaise(visit.invoice.balancePaise)} on invoice{' '}
              <span className="font-mono">{visit.invoice.invoiceNumber}</span>. The consultation
              opens once the fee is collected.
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

  const disabled = locked;
  const busy = saving || signing || amending;

  return (
    <>
      <Link
        href="/opd"
        className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft size={15} strokeWidth={2} /> OPD queue
      </Link>
      {/* Sticky (ADR-128): the doctor fills prescriptions and lab orders well below the fold, and
          Save must not be something they scroll back up to find. */}
      <PageHeader
        sticky
        title="Consultation"
        description={`${enc.patientName} · ${enc.patientUhid}${enc.providerName ? ` · ${enc.providerName}` : ''}`}
        actions={
          locked ? (
            <>
              <Badge tone="success">Signed {formatDateTime(enc.signedAt, '')}</Badge>
              <Link href={`/print/prescription/${visitId}`}>
                <Button variant="secondary">
                  <Printer size={16} strokeWidth={2} /> Print prescription
                </Button>
              </Link>
              <Can perm={PERMISSIONS.EMR_AMEND}>
                <Button
                  onClick={() => {
                    setAmendReason('');
                    setAmendError(null);
                    setAmendPromptOpen(true);
                  }}
                >
                  <FilePenLine size={16} strokeWidth={2} /> Amend consultation
                </Button>
              </Can>
            </>
          ) : (
            <>
              {/* Stated, not implied: the doctor can see at a glance whether the note on screen
                  is the note on the server, from anywhere on the page. */}
              <span className="text-xs text-fg-muted">
                {dirty ? 'Unsaved changes' : inAmendment ? 'Amendment saved' : 'All changes saved'}
              </span>
              {inAmendment && (
                <Button
                  variant="ghost"
                  onClick={() => setPending({ kind: 'amend-cancel' })}
                  disabled={busy || dirty}
                  title={dirty ? 'Save or discard your corrections first' : undefined}
                >
                  Discard amendment
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => void save()}
                loading={saving}
                disabled={signing || amending}
              >
                Save
              </Button>
              <Button
                onClick={() => setPending({ kind: 'sign' })}
                loading={signing}
                disabled={saving || amending}
              >
                {inAmendment ? 'Sign amendment' : 'Sign & complete'}
              </Button>
            </>
          )
        }
      />

      {error && <Alert tone="danger">{error}</Alert>}

      {/* A reopened note looks exactly like a draft while it is being edited, so the screen has
          to keep saying which it is, and under whose stated reason. */}
      {inAmendment && enc.openAmendment && (
        <Alert tone="warning">
          <span className="font-medium">This signed consultation is open for amendment.</span> The
          note as signed on {formatDateTime(enc.signedAt, '')} is preserved. Reason:{' '}
          <span className="italic">“{enc.openAmendment.reason}”</span> —{' '}
          {enc.openAmendment.amendedByName ?? 'a user'},{' '}
          {formatDateTime(enc.openAmendment.createdAt, '')}. Signing again records what changed.
        </Alert>
      )}

      {locked && !canAmend && (
        <Alert tone="neutral">
          This consultation is signed and locked. Correcting a signed record needs the{' '}
          <span className="font-medium">Amend a signed consultation</span> permission (
          <span className="font-mono text-xs">emr.encounter.amend</span>), which your role does not
          hold — ask your administrator, or the clinician who signed it.
        </Alert>
      )}

      {workflow?.vitalsMode !== 'disabled' && (
        <Card header="Vitals">
          {/* Readings taken earlier in the workflow, with who took each and when — a reading is
              read differently depending on where in the visit it was measured. */}
          {enc && enc.vitalsHistory.length > 0 && (
            <ul className="mb-4 flex flex-col gap-1 rounded-token border border-border bg-surface-2 p-3">
              {enc.vitalsHistory.slice(0, 4).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                  <Badge tone={r.stage === 'consultation' ? 'brand' : 'neutral'}>
                    {VITALS_STAGE_LABEL[r.stage]}
                  </Badge>
                  <span className="text-fg">{summariseVitals(r)}</span>
                  <span className="ml-auto">
                    {r.recordedByName ? `${r.recordedByName} · ` : ''}
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
            optional={[
              ...(workflow?.vitalsRequiredParams ?? []),
              ...(workflow?.vitalsOptionalParams ?? []),
            ]}
            disabled={disabled}
          />
        </Card>
      )}

      <Card header="Notes (SOAP)">
        <div className="flex flex-col gap-4">
          <div className="hms-field">
            <div className="flex items-center justify-between gap-2">
              <span className="hms-label">Chief complaint</span>
              {!disabled && (
                <DictationButton onText={(t) => setChiefComplaint((v) => (v ? `${v} ${t}` : t))} />
              )}
            </div>
            <input
              className="hms-input w-full"
              placeholder="In a few words — Fever, Chest pain, Diabetes follow-up"
              value={chiefComplaint}
              disabled={disabled}
              onChange={(e) => setChiefComplaint(e.target.value)}
            />
          </div>
          {/* `[&>*]:min-w-0` — a grid track sizes to its longest unbroken content, so one long
              line of dictated text would otherwise push the page sideways (ADR-127). */}
          <div className="grid items-start gap-4 sm:grid-cols-2 [&>*]:min-w-0">
            {(['subjective', 'objective', 'assessment', 'plan'] as const).map((k) => (
              <div key={k} className="hms-field">
                <div className="flex items-center justify-between gap-2">
                  <span className="hms-label capitalize">{k}</span>
                  {!disabled && (
                    <DictationButton
                      onText={(t) => setSoap((s) => ({ ...s, [k]: s[k] ? `${s[k]} ${t}` : t }))}
                    />
                  )}
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
          <div className="mb-3">
            {/* Search-and-add: the server searches, so the component must not filter its answer
                away, and a picked code adds a row rather than binding the field's value. */}
            <Combobox
              label="Add a diagnosis"
              value={icdQuery}
              onChange={(text) => setIcdQuery(text)}
              options={icdOptions}
              onSelect={(o) => addDx(o.value, o.label)}
              filter={false}
              allowCustomValue={false}
              loading={icdSearching}
              placeholder="Search ICD-10 by code or term — fever, J45, diabetes…"
              emptyMessage={
                icdQuery.trim() ? 'No ICD-10 code matches that.' : 'Type to search the ICD-10 list.'
              }
            />
          </div>
        )}
        {dx.length === 0 ? (
          <p className="text-sm text-fg-subtle">No diagnoses added.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {dx.map((d, i) => (
              <li key={d.icd10Code} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-xs text-brand">{d.icd10Code}</span>
                <span className="min-w-0 flex-1 text-fg">{d.icd10Term}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    setDx((prev) => prev.map((x, j) => ({ ...x, isPrimary: j === i })))
                  }
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${d.isPrimary ? 'bg-brand text-brand-fg' : 'text-fg-muted hover:bg-surface-2'}`}
                >
                  Primary
                </button>
                {!disabled && (
                  <button
                    type="button"
                    aria-label={`Remove ${d.icd10Term}`}
                    className="shrink-0 text-fg-subtle hover:text-danger"
                    onClick={() => setDx((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        header="Prescriptions"
        // The add action sits at the END of the list it extends (ADR-128 / the card footer):
        // asking the doctor to reach back up past a half-filled row is what the header did.
        footer={
          !disabled ? (
            <>
              {blankRxCount > 0 && (
                <span className="text-xs text-fg-muted">
                  {blankRxCount} row{blankRxCount > 1 ? 's' : ''} without a medicine — not saved.
                </span>
              )}
              <span className="hms-card__footer-spacer" />
              {aiEnabled && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void draftWithAi()}
                  loading={aiBusy}
                >
                  <Sparkles size={15} /> AI draft
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setRx((p) => [
                    ...p,
                    {
                      id: null,
                      drugId: null,
                      drugName: '',
                      dose: '',
                      frequency: '',
                      duration: '',
                      route: '',
                      instructions: '',
                      status: 'ordered',
                    },
                  ])
                }
              >
                <Plus size={15} /> Add medicine
              </Button>
            </>
          ) : undefined
        }
      >
        {aiNote && (
          <Alert tone="neutral">
            AI note: {aiNote}. Every drafted line is a suggestion; review, correct and delete freely
            before saving.
          </Alert>
        )}
        {rx.length === 0 ? (
          <p className="text-sm text-fg-subtle">No medications prescribed.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {rx.map((p, i) => {
              // A row the pharmacy has already handled is clinical history — locked.
              const rowLocked = disabled || p.status !== 'ordered';
              const matched = p.drugId ? drugs.find((d) => d.id === p.drugId) : undefined;
              return (
                <div key={p.id ?? `new-${i}`} className="rounded-token border border-border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-fg-muted">Medicine {i + 1}</span>
                    <div className="flex items-center gap-2">
                      {p.status !== 'ordered' && (
                        <Badge tone={p.status === 'dispensed' ? 'success' : 'neutral'}>
                          {p.status}
                        </Badge>
                      )}
                      {!rowLocked && (
                        <button
                          type="button"
                          aria-label={`Remove ${p.drugName || `medicine ${i + 1}`}`}
                          className="text-fg-subtle hover:text-danger"
                          onClick={() => removeRx(i)}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                  {/* `items-start` is what fixes the alignment: without it every control stretches
                      to the tallest cell, so a field carrying a hint made its neighbours taller
                      than themselves. Each control now keeps its own height and the labels line up. */}
                  <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-6 [&>*]:min-w-0">
                    <div className="lg:col-span-2">
                      <Combobox
                        label="Drug"
                        value={p.drugName}
                        onChange={(text, option) =>
                          setRx((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, drugName: text, drugId: option?.value ?? null } : x,
                            ),
                          )
                        }
                        options={drugOptions}
                        loading={mastersLoading}
                        disabled={rowLocked}
                        placeholder="Pick from the formulary, or type"
                        emptyMessage="Not in this hospital's drug master."
                        customValueHint="Not in the drug master; pharmacy will match it by hand"
                        hint={
                          matched
                            ? `In stock: ${matched.onHand} · ${formatPaise(matched.unitPricePaise)}/${matched.unit}`
                            : undefined
                        }
                      />
                    </div>
                    <Field
                      label="Dose"
                      placeholder="500 mg"
                      value={p.dose}
                      disabled={rowLocked}
                      onChange={(e) =>
                        setRx((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, dose: e.target.value } : x)),
                        )
                      }
                    />
                    <Combobox
                      label="Frequency"
                      value={p.frequency}
                      onChange={(text) =>
                        setRx((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, frequency: text } : x)),
                        )
                      }
                      options={FREQUENCY_SUGGESTIONS}
                      disabled={rowLocked}
                      placeholder="1-0-1"
                      emptyMessage="No standard schedule matches — type your own."
                    />
                    <Combobox
                      label="Route"
                      value={p.route}
                      onChange={(text) =>
                        setRx((prev) => prev.map((x, j) => (j === i ? { ...x, route: text } : x)))
                      }
                      options={ROUTE_SUGGESTIONS}
                      disabled={rowLocked}
                      placeholder="Oral"
                      emptyMessage="No standard route matches — type your own."
                    />
                    <Field
                      label="Duration"
                      placeholder="5 days"
                      value={p.duration}
                      disabled={rowLocked}
                      onChange={(e) =>
                        setRx((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, duration: e.target.value } : x)),
                        )
                      }
                    />
                    <div className="sm:col-span-2 lg:col-span-6">
                      <Field
                        label="Instructions"
                        placeholder="After food, with plenty of water…"
                        value={p.instructions}
                        disabled={rowLocked}
                        onChange={(e) =>
                          setRx((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, instructions: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card
        header="Lab orders"
        footer={
          !disabled ? (
            <>
              {blankLabCount > 0 && (
                <span className="text-xs text-fg-muted">
                  {blankLabCount} row{blankLabCount > 1 ? 's' : ''} without a test — not saved.
                </span>
              )}
              <span className="hms-card__footer-spacer" />
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setLab((l) => [
                    ...l,
                    {
                      id: null,
                      testId: null,
                      testName: '',
                      testCode: '',
                      priority: 'routine',
                      status: 'ordered',
                    },
                  ])
                }
              >
                <Plus size={15} /> Add test
              </Button>
            </>
          ) : undefined
        }
      >
        {lab.length === 0 ? (
          <p className="text-sm text-fg-subtle">No lab tests ordered.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {lab.map((l, i) => {
              // Collected / resulted orders are in the lab's hands — locked here.
              const rowLocked = disabled || l.status !== 'ordered';
              const matched = l.testId ? labTests.find((t) => t.id === l.testId) : undefined;
              return (
                <div key={l.id ?? `new-${i}`} className="rounded-token border border-border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-fg-muted">Test {i + 1}</span>
                    <div className="flex items-center gap-2">
                      {l.status !== 'ordered' && (
                        <Badge tone={l.status === 'resulted' ? 'success' : 'brand'}>
                          {l.status}
                        </Badge>
                      )}
                      {!rowLocked && (
                        <button
                          type="button"
                          aria-label={`Remove ${l.testName || `test ${i + 1}`}`}
                          className="text-fg-subtle hover:text-danger"
                          onClick={() => removeLab(i)}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
                    <div className="sm:col-span-2">
                      <Combobox
                        label="Test"
                        value={l.testName}
                        onChange={(text, option) =>
                          setLab((prev) =>
                            prev.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    testName: text,
                                    testId: option?.value ?? null,
                                    testCode: option
                                      ? (labTests.find((t) => t.id === option.value)?.code ?? '')
                                      : x.testCode,
                                  }
                                : x,
                            ),
                          )
                        }
                        options={labTestOptions}
                        loading={mastersLoading}
                        disabled={rowLocked}
                        placeholder="Pick from the test master, or type"
                        emptyMessage="Not in this hospital's test master."
                        customValueHint="Not in the test master; priced when the lab matches it"
                        hint={
                          matched
                            ? `${formatPaise(matched.pricePaise)} · billed at sample collection`
                            : undefined
                        }
                      />
                    </div>
                    <Field
                      label="Code"
                      placeholder="CBC"
                      value={l.testCode}
                      disabled={rowLocked}
                      onChange={(e) =>
                        setLab((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, testCode: e.target.value } : x)),
                        )
                      }
                    />
                    <Select
                      label="Priority"
                      value={l.priority}
                      onChange={(v) =>
                        setLab((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, priority: v || 'routine' } : x)),
                        )
                      }
                      options={[
                        { value: 'routine', label: 'Routine' },
                        {
                          value: 'urgent',
                          label: 'Urgent',
                          description: 'Ahead of the routine queue',
                        },
                      ]}
                      disabled={rowLocked}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* The amendment trail: who reopened a signed note, when, why, and what they changed.
          Rendered whenever there is one, signed or not — it is part of the record. */}
      {enc.amendments.length > 0 && (
        <Card header={`Amendments (${enc.amendments.length})`}>
          <ul className="flex flex-col divide-y divide-border text-sm">
            {enc.amendments.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      a.status === 'completed'
                        ? 'success'
                        : a.status === 'open'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {a.status === 'completed'
                      ? 'Recorded'
                      : a.status === 'open'
                        ? 'In progress'
                        : 'Discarded'}
                  </Badge>
                  <span className="text-fg">{a.amendedByName ?? 'Unknown user'}</span>
                  <span className="text-fg-muted">
                    {formatDateTime(a.completedAt ?? a.createdAt, '')}
                  </span>
                </div>
                <p className="text-fg-muted">
                  <span className="italic">“{a.reason}”</span>
                </p>
                {a.status === 'completed' && (
                  <p className="text-xs text-fg-muted">
                    {a.changedFields && a.changedFields.length > 0
                      ? `Changed: ${a.changedFields.map((f) => FIELD_LABEL[f] ?? f).join(', ')}`
                      : 'Reopened and re-signed without changing anything.'}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {canRefer && (
        <Card header="Refer to a department">
          {referrals.length > 0 && (
            <ul className="mb-3 flex flex-col divide-y divide-border text-sm">
              {referrals.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <span className="font-medium text-fg">{r.toDepartmentName}</span>
                    {r.toProviderName && (
                      <span className="ml-2 text-fg-muted">{r.toProviderName}</span>
                    )}
                    <p className="truncate text-xs text-fg-muted">{r.reason}</p>
                  </div>
                  <Badge
                    tone={
                      r.status === 'completed'
                        ? 'success'
                        : r.status === 'pending'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {r.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
            <Select
              label="Department"
              value={refDept}
              onChange={setRefDept}
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
              placeholder="Choose…"
              emptyMessage="No active departments."
            />
            <Select
              label="Doctor (optional)"
              value={refProvider}
              onChange={setRefProvider}
              options={providers
                .filter((p) => p.isActive)
                .map((p) => ({ value: p.id, label: p.fullName }))}
              placeholder="Any"
              clearable
              emptyMessage="No active doctors."
            />
            <div className="sm:col-span-2">
              <Field
                label="Reason"
                placeholder="Why this department…"
                value={refReason}
                onChange={(e) => setRefReason(e.target.value)}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-fg-subtle">
            The front desk checks the patient in against the referral. The receiving department
            opens this same chart.
          </p>
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              onClick={() => void refer()}
              loading={referring}
              disabled={!refDept || !refReason.trim()}
            >
              <Send size={14} /> Refer
            </Button>
          </div>
        </Card>
      )}

      <Card header={`Past consultations${history ? ` (${history.length})` : ''}`}>
        {!history ? (
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <Spinner /> Loading history…
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-fg-subtle">
            No earlier signed consultations for this patient.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {history.slice(0, 8).map((h) => (
              <li key={h.id} className="py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/opd/${h.visitId}`}
                      className="font-mono font-medium text-brand hover:underline"
                    >
                      {h.visitNumber}
                    </Link>
                    <span className="ml-2 text-fg-muted">{formatDate(h.visitDate)}</span>
                    {h.providerName && <span className="ml-2 text-fg-muted">{h.providerName}</span>}
                  </div>
                  <span className="shrink-0 text-xs text-fg-muted">
                    {h.prescriptionCount} rx · {h.labOrderCount} lab
                  </span>
                </div>
                {(h.chiefComplaint || h.diagnoses.length > 0) && (
                  <p className="mt-1 truncate text-fg-muted">
                    {h.chiefComplaint}
                    {h.chiefComplaint && h.diagnoses.length > 0 && ' · '}
                    {h.diagnoses.map((d) => `${d.icd10Code} ${d.icd10Term}`).join(', ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Every confirmation on this page is the one shared dialog (ADR-029) — the browser's own
          `confirm()` cannot be styled, cannot be themed, and names the origin rather than the act. */}
      <ConfirmDialog
        open={pending?.kind === 'sign'}
        tone="default"
        title={inAmendment ? 'Sign this amendment?' : 'Sign this consultation?'}
        description={
          inAmendment
            ? 'The correction is recorded against the amendment — who made it, when, and which parts of the note changed. The consultation locks again.'
            : 'Once signed, the consultation is locked and the visit is marked completed. Correcting it afterwards needs a recorded amendment.'
        }
        confirmLabel={inAmendment ? 'Sign amendment' : 'Sign consultation'}
        busy={signing}
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      />

      <ConfirmDialog
        open={pending?.kind === 'amend-cancel'}
        title="Discard this amendment?"
        description="The consultation goes back to signed, exactly as it was. The record that it was reopened, and the reason given, is kept."
        confirmLabel="Discard amendment"
        busy={amending}
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      />

      <ConfirmDialog
        open={pending?.kind === 'rx'}
        title="Delete prescription?"
        description={
          pending?.kind === 'rx'
            ? `${pending.name} will be removed from this consultation when you save. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      />

      <ConfirmDialog
        open={pending?.kind === 'lab'}
        title="Delete lab order?"
        description={
          pending?.kind === 'lab'
            ? `${pending.name} will be removed from this consultation when you save. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      />

      {/* Not a ConfirmDialog: an amendment asks for something, it does not ask yes or no. */}
      <Dialog
        open={amendPromptOpen}
        onClose={() => setAmendPromptOpen(false)}
        title="Amend this consultation"
        size="sm"
        busy={amending}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setAmendPromptOpen(false)}
              disabled={amending}
            >
              Cancel
            </Button>
            <Button onClick={() => void beginAmendment()} loading={amending}>
              Amend consultation
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg-muted">
            The consultation signed on {formatDateTime(enc.signedAt, '')} is preserved exactly as it
            stands. Your corrections are recorded as an amendment against it — your name, the time,
            this reason, and which parts of the note you changed. Nothing is overwritten.
          </p>
          <div className="hms-field">
            <label className="hms-label" htmlFor="amend-reason">
              Reason for the amendment
            </label>
            <textarea
              id="amend-reason"
              className="hms-input min-h-[90px] w-full"
              placeholder="Corrected the recorded weight — 72 kg was entered as 7.2 kg."
              value={amendReason}
              onChange={(e) => {
                setAmendReason(e.target.value);
                if (amendError) setAmendError(null);
              }}
              aria-invalid={!!amendError}
            />
            {amendError ? (
              <span className="hms-field__error">{amendError}</span>
            ) : (
              <span className="hms-field__hint">
                Permanent, and read by anyone reviewing this record later.
              </span>
            )}
          </div>
        </div>
      </Dialog>
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
