"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Badge, Button, Card, Field, PageHeader, Spinner, toast } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { Branch } from "@hms/types";
import { ArrowLeft, Pencil, Save, Search, Send } from "lucide-react";
import * as api from "../../../../../lib/api";
import { RequirePermission } from "../../../../../components/Can";
import { useCan } from "../../../../../lib/auth";
import { RegistryMasterSelect } from "../../../../../components/abdm/RegistryMasterSelect";

/**
 * Registering the hospital in the Health Facility Registry (ADR-096; HFR-010…HFR-063).
 *
 * Every field here traces to a numbered case in NHA's HFR workbook, and the shape of the screen is
 * decided by one fact about the process: **registration is filled over days and judged by a human,
 * weeks later.** Four consequences, all of which are the point:
 *
 * - **Save is not submit.** A draft saves in any state, with anything blank, because nobody has the
 *   CEA number and the ventilator count to hand in one sitting. Completeness is checked once, at
 *   submit, where it matters.
 * - **Submitted is never shown as approved.** HFR routes every registration to a verifier. A green
 *   tick would have somebody believe they hold a Facility ID they do not, and discover otherwise
 *   when ABDM's service registration fails a month later.
 * - **A rejection reopens the form with everything still in it.** The registry answers in its own
 *   words; those are shown verbatim rather than reworded, because the verifier is who has to be
 *   satisfied and their phrasing is the instruction.
 * - **Nothing is guessed on the operator's behalf.** Bed totals are stated, not computed — the
 *   workbook asks a person to be accountable for them. A mismatch is pointed out, never silently
 *   corrected.
 */

const STATUS: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger"; note: string }> = {
  draft: { label: "Not submitted", tone: "neutral", note: "Nothing has been sent to the registry yet." },
  submitted: {
    label: "Awaiting verification",
    tone: "warning",
    note: "Sent to HFR. A verifier reviews it by hand, which takes time — this is not yet an approval.",
  },
  under_review: { label: "Under review", tone: "warning", note: "A verifier has picked it up." },
  verified: { label: "Verified", tone: "success", note: "HFR has issued a Facility ID." },
  rejected: { label: "Rejected", tone: "danger", note: "Correct what the registry asked for and submit again." },
};

/** Bed counts, in the order and wording the workbook uses (HFR-050…061). */
const BED_FIELDS: Array<{ key: string; label: string; max: number }> = [
  { key: "countIPDBedsWithoutOxygen", label: "IPD beds without oxygen", max: 99 },
  { key: "countIPDBedsWithOxygen", label: "IPD beds with oxygen", max: 99 },
  { key: "countICUBedsWithVentilators", label: "ICU beds with ventilators", max: 99 },
  { key: "countICUBedsWithoutVentilators", label: "ICU beds without ventilators", max: 99 },
  { key: "countHDUBedsWithFunctionalVentilators", label: "HDU beds with functional ventilators", max: 99 },
  { key: "countHDUBedsWithVentilators", label: "HDU beds with ventilators", max: 99 },
  { key: "countHDUBedsWithoutVentilators", label: "HDU beds without ventilators", max: 99 },
  { key: "countDayCareBedsWithoutOxygen", label: "Day-care beds without oxygen", max: 99 },
  { key: "countDayCareBedsWithOxygen", label: "Day-care beds with oxygen", max: 99 },
  { key: "countDentalChairs", label: "Dental chairs", max: 99 },
];

/** Identifiers the facility may already hold elsewhere (HFR-039…046). All optional. */
const PROGRAMME_FIELDS: Array<{ key: string; label: string; hint: string }> = [
  { key: "nhrrId", label: "NHRR ID", hint: "National Health Resource Repository" },
  { key: "ninId", label: "NIN", hint: "National Identification Number" },
  { key: "abPmjayId", label: "AB-PMJAY hospital ID", hint: "Ayushman Bharat" },
  { key: "rohiniId", label: "ROHINI ID", hint: "Registry of Hospitals in Network of Insurance" },
  { key: "echsId", label: "ECHS ID", hint: "Ex-Servicemen Contributory Health Scheme" },
  { key: "cghsId", label: "CGHS ID", hint: "Central Government Health Scheme" },
  { key: "ceaRegistrationNumber", label: "CEA registration number", hint: "Clinical Establishments Act" },
  { key: "stateInsuranceSchemeId", label: "State insurance scheme ID", hint: "If the state runs one" },
];

type Draft = {
  facilityName: string;
  ownershipCode: string;
  ownershipSubTypeCode: string;
  ownershipSubTypeCode2: string;
  facilityTypeCode: string;
  facilitySubType: string;
  facilityOperationalStatus: string;
  systemOfMedicineCodes: string[];
  address: Record<string, string>;
  contact: Record<string, string>;
  timings: Array<{ workingDays: string; openingHours: string }>;
  infrastructure: Record<string, string>;
  programmeIds: Record<string, string>;
};

const EMPTY: Draft = {
  facilityName: "",
  ownershipCode: "",
  ownershipSubTypeCode: "",
  ownershipSubTypeCode2: "",
  facilityTypeCode: "",
  facilitySubType: "",
  facilityOperationalStatus: "",
  systemOfMedicineCodes: [],
  address: {},
  contact: {},
  timings: [],
  infrastructure: {},
  programmeIds: {},
};

export default function FacilityRegistrationPage() {
  return (
    <RequirePermission perm={PERMISSIONS.ABDM_REGISTRY_VIEW}>
      <FacilityRegistration />
    </RequirePermission>
  );
}

function FacilityRegistration() {
  const canManage = useCan(PERMISSIONS.ABDM_REGISTRY_MANAGE);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>("");
  const [registrations, setRegistrations] = useState<api.AbdmFacilityRegistration[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const current = useMemo(
    () => registrations.find((r) => (r.branchId ?? "") === branchId) ?? null,
    [registrations, branchId],
  );
  const status = STATUS[current?.status ?? "draft"]!;
  /**
   * Amending a facility HFR has already verified.
   *
   * A verified registration is read-only by default and that is the safe default: it is the record
   * a national registry holds about this building, and the Facility ID on it is the `hipId` the
   * rest of ABDM knows us by. But a registered hospital still changes — beds, contacts, a rename —
   * so the form has to be reachable. It is reachable through an explicit act rather than by being
   * editable on arrival, because the difference between "correcting my draft" and "changing the
   * national registry" should be something the administrator chose, not something they discovered.
   */
  const [amending, setAmending] = useState(false);
  const isVerified = current?.status === "verified";

  // A registration under review is the registry's to change, not ours — editing it locally would
  // show an administrator a form that no longer matches what a verifier is looking at. A verified
  // one unlocks only while amending.
  const locked =
    current?.status === "submitted" ||
    current?.status === "under_review" ||
    (isVerified && !amending);
  const readOnly = !canManage || locked;

  const load = useCallback(async () => {
    const [b, r] = await Promise.all([
      api.listBranches().catch(() => [] as Branch[]),
      api.listAbdmFacilityRegistrations().catch(() => [] as api.AbdmFacilityRegistration[]),
    ]);
    setBranches(b);
    setRegistrations(r);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Reopening a saved draft must restore it exactly — forty fields is far too many to re-key.
  useEffect(() => {
    const payload = (current?.payload ?? null) as Partial<Draft> | null;
    setDraft(
      payload
        ? {
            ...EMPTY,
            ...payload,
            address: { ...(payload.address ?? {}) },
            contact: { ...(payload.contact ?? {}) },
            infrastructure: { ...(payload.infrastructure ?? {}) },
            programmeIds: { ...(payload.programmeIds ?? {}) },
            systemOfMedicineCodes: payload.systemOfMedicineCodes ?? [],
            timings: payload.timings ?? [],
            facilityName: payload.facilityName ?? current?.facilityName ?? "",
          }
        : { ...EMPTY, facilityName: current?.facilityName ?? "" },
    );
    setErrors({});
  }, [current]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setNested = (group: "address" | "contact" | "infrastructure" | "programmeIds", key: string, value: string) =>
    setDraft((d) => ({ ...d, [group]: { ...d[group], [key]: value } }));

  /** Only what the registry itself rejects. A draft is allowed to be incomplete; a submission is not. */
  function validateForSubmit(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!/^[A-Za-z][A-Za-z0-9 .,'&()/-]*$/.test(draft.facilityName.trim()))
      e.facilityName = "Must start with a letter (HFR-010).";
    if (!draft.address.stateLGDCode) e.state = "Required.";
    if (!draft.address.districtLGDCode) e.district = "Required.";
    if (!draft.address.addressLine1) e.addressLine1 = "Required.";
    if (draft.address.pincode && !/^\d{6}$/.test(draft.address.pincode)) e.pincode = "Six digits (HFR-019).";
    if (!draft.address.pincode) e.pincode = "Required.";
    if (!draft.facilityTypeCode) e.facilityType = "Required.";
    if (!draft.ownershipCode) e.ownership = "Required.";
    if (draft.systemOfMedicineCodes.length === 0) e.medicine = "Choose at least one (HFR-034).";
    if (!draft.facilityOperationalStatus) e.operationalStatus = "Required.";
    if (draft.contact.facilityContactNumber && !/^\d{10}$/.test(draft.contact.facilityContactNumber))
      e.mobile = "Ten digits.";
    if (draft.contact.facilityLandlineNumber && !/^\d{6,8}$/.test(draft.contact.facilityLandlineNumber))
      e.landline = "Six to eight digits.";
    if (draft.contact.facilityEmailId && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.contact.facilityEmailId))
      e.email = "Not a valid email address.";
    return e;
  }

  function toBody() {
    const num = (v?: string) => (v === "" || v === undefined ? undefined : Number(v));
    return {
      branchId: branchId || null,
      facilityName: draft.facilityName.trim(),
      ownershipCode: draft.ownershipCode || undefined,
      ownershipSubTypeCode: draft.ownershipSubTypeCode || undefined,
      ownershipSubTypeCode2: draft.ownershipSubTypeCode2 || undefined,
      facilityTypeCode: draft.facilityTypeCode || undefined,
      facilitySubType: draft.facilitySubType || undefined,
      facilityOperationalStatus: draft.facilityOperationalStatus || undefined,
      systemOfMedicineCodes: draft.systemOfMedicineCodes,
      address: Object.fromEntries(Object.entries(draft.address).filter(([, v]) => v !== "")),
      contact: Object.fromEntries(Object.entries(draft.contact).filter(([, v]) => v !== "")),
      timings: draft.timings.filter((t) => t.workingDays && t.openingHours),
      infrastructure: Object.fromEntries(
        Object.entries(draft.infrastructure)
          .map(([k, v]) => [k, num(v)])
          .filter(([, v]) => v !== undefined),
      ),
      programmeIds: Object.fromEntries(Object.entries(draft.programmeIds).filter(([, v]) => v !== "")),
    };
  }

  async function save() {
    // Deliberately no validation here beyond the name the row is keyed by: a half-filled draft is
    // the normal state of this form, and refusing to save one would lose an afternoon's typing.
    if (!draft.facilityName.trim()) {
      setErrors({ facilityName: "A name is needed before this can be saved." });
      return;
    }
    setSaving(true);
    try {
      await api.saveAbdmFacilityRegistration(toBody());
      await load();
      toast.success("Draft saved. Nothing has been sent to the registry yet.");
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    const e = validateForSubmit();
    setErrors(e);
    if (Object.keys(e).length > 0) {
      toast.error("Some required details are missing. They are marked below.");
      return;
    }
    setSubmitting(true);
    try {
      await api.saveAbdmFacilityRegistration(toBody());
      await api.submitAbdmFacilityRegistration(branchId || null);
      await load();
      // Never "Registered." — a verifier still has to look at it, and saying otherwise is the
      // single most misleading thing this screen could do.
      toast.success("Sent to HFR. A verifier reviews it by hand — you will not have a Facility ID yet.");
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Sends an amendment for a facility HFR has already verified.
   *
   * Validated like a submission, not like a draft: what goes to the registry has to be complete
   * whether it is the first version or the fifth. Deliberately a different call from `submit()` —
   * saving refuses a verified registration precisely so nobody re-registers a building that already
   * holds a Facility ID and gives it a second national identity.
   */
  async function sendUpdate() {
    const e = validateForSubmit();
    setErrors(e);
    if (Object.keys(e).length > 0) {
      toast.error("Some required details are missing. They are marked below.");
      return;
    }
    setSubmitting(true);
    try {
      await api.updateAbdmFacilityRegistration(toBody());
      await load();
      setAmending(false);
      // Not "Saved." — this went to a national registry, and the Facility ID is unchanged.
      toast.success("Sent to HFR. The Facility ID stays the same; the details are updated.");
    } finally {
      setSubmitting(false);
    }
  }

  const bedsWithVentilators =
    Number(draft.infrastructure.countICUBedsWithVentilators || 0) +
    Number(draft.infrastructure.countHDUBedsWithFunctionalVentilators || 0) +
    Number(draft.infrastructure.countHDUBedsWithVentilators || 0);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Health Facility Registry"
        description="List this hospital in ABDM's national facility registry. Fields marked * are required by HFR."
        actions={
          <div className="flex flex-wrap gap-2">
            {/* Offered here, not only on the previous screen: the moment somebody doubts whether
                this hospital is already listed is while they are filling the form in. */}
            <Link href="/hospital-setup/registry/facility/search">
              <Button variant="secondary">
                <Search className="size-4" aria-hidden /> Search the registry
              </Button>
            </Link>
            <Link href="/hospital-setup/registry">
              <Button variant="ghost">
                <ArrowLeft className="size-4" aria-hidden /> Back to registries
              </Button>
            </Link>
          </div>
        }
      />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge tone={status.tone}>{status.label}</Badge>
            <p className="mt-1 text-sm text-fg-muted">{status.note}</p>
            {current?.trackingId ? <p className="mt-1 text-sm text-fg-muted">Tracking ID: {current.trackingId}</p> : null}
            {current?.facilityId ? <p>Facility ID: {current.facilityId}</p> : null}
          </div>
          {branches.length > 0 ? (
            <div className="hms-field">
              <label className="hms-label" htmlFor="reg-branch">
                Facility
              </label>
              <select
                id="reg-branch"
                className="hms-input"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                <option value="">Main hospital</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <span className="hms-field__hint">Each branch is a separate facility to HFR.</span>
            </div>
          ) : null}
        </div>

        {current?.status === "rejected" && current.statusMessage ? (
          <Alert tone="danger" title="The registry rejected this registration">
            {/* The verifier's own words. Rewording them would obscure the instruction. */}
            {current.statusMessage}
          </Alert>
        ) : null}

        {locked ? (
          <Alert tone="neutral" title="This registration is with the registry">
            It cannot be edited while a verifier has it. If something is wrong, wait for the outcome — a rejection
            reopens this form with everything still filled in.
          </Alert>
        ) : null}
      </Card>

      <Card header="Facility identity">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Facility name *"
            value={draft.facilityName}
            error={errors.facilityName}
            hint="Starts with a letter. As it should appear in the registry."
            disabled={readOnly}
            onChange={(e) => set("facilityName", e.target.value)}
          />
          <RegistryMasterSelect
            label="Operational status"
            kind="masterData"
            type="FAC-STATUS"
            required
            value={draft.facilityOperationalStatus}
            disabled={readOnly}
            hint={errors.operationalStatus}
            onChange={(v) => set("facilityOperationalStatus", v)}
          />
        </div>
      </Card>

      <Card header="Ownership">
        <div className="grid gap-4 sm:grid-cols-2">
          <RegistryMasterSelect
            label="Ownership"
            kind="masterData"
            type="OWNER"
            required
            value={draft.ownershipCode}
            disabled={readOnly}
            hint={errors.ownership}
            onChange={(v) => set("ownershipCode", v)}
          />
          <RegistryMasterSelect
            label="Ownership subtype"
            kind="ownerSubtype"
            filters={{ ownershipCode: draft.ownershipCode, ownerSubtypeCode: draft.ownershipCode }}
            parentHint="Choose an ownership first"
            value={draft.ownershipSubTypeCode}
            disabled={readOnly}
            hint="HFR requires this only for government-owned facilities (HFR-032)."
            onChange={(v) => set("ownershipSubTypeCode", v)}
          />
          <RegistryMasterSelect
            label="Central government body"
            kind="masterData"
            type="CENTRAL-GOVERNMENT"
            value={draft.ownershipSubTypeCode2}
            disabled={readOnly}
            hint="Only for a central-government facility (HFR-033)."
            onChange={(v) => set("ownershipSubTypeCode2", v)}
          />
        </div>
      </Card>

      <Card header="Location and address">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Country" value="India" disabled readOnly hint="Fixed by HFR (HFR-013)." />
          <RegistryMasterSelect
            label="State / UT"
            kind="states"
            required
            value={draft.address.stateLGDCode ?? ""}
            disabled={readOnly}
            hint={errors.state}
            onChange={(v) => setNested("address", "stateLGDCode", v)}
          />
          <RegistryMasterSelect
            label="District"
            kind="districts"
            required
            filters={{ code: draft.address.stateLGDCode }}
            parentHint="Choose a state first"
            value={draft.address.districtLGDCode ?? ""}
            disabled={readOnly}
            hint={errors.district}
            onChange={(v) => setNested("address", "districtLGDCode", v)}
          />
          <RegistryMasterSelect
            label="Sub-district"
            kind="subDistricts"
            filters={{ code: draft.address.districtLGDCode }}
            parentHint="Choose a district first"
            value={draft.address.subDistrictLGDCode ?? ""}
            disabled={readOnly}
            onChange={(v) => setNested("address", "subDistrictLGDCode", v)}
          />
          <Field
            label="Address line 1 *"
            value={draft.address.addressLine1 ?? ""}
            error={errors.addressLine1}
            disabled={readOnly}
            onChange={(e) => setNested("address", "addressLine1", e.target.value)}
          />
          <Field
            label="Address line 2"
            value={draft.address.addressLine2 ?? ""}
            disabled={readOnly}
            onChange={(e) => setNested("address", "addressLine2", e.target.value)}
          />
          <Field
            label="Pincode *"
            inputMode="numeric"
            maxLength={6}
            value={draft.address.pincode ?? ""}
            error={errors.pincode}
            disabled={readOnly}
            onChange={(e) => setNested("address", "pincode", e.target.value.replace(/\D/g, ""))}
          />
          <div />
          <Field
            label="Latitude"
            inputMode="decimal"
            value={draft.address.latitude ?? ""}
            hint="Decimal degrees, e.g. 12.9716 (HFR-011)."
            disabled={readOnly}
            onChange={(e) => setNested("address", "latitude", e.target.value)}
          />
          <Field
            label="Longitude"
            inputMode="decimal"
            value={draft.address.longitude ?? ""}
            hint="Decimal degrees, e.g. 77.5946 (HFR-012)."
            disabled={readOnly}
            onChange={(e) => setNested("address", "longitude", e.target.value)}
          />
        </div>
      </Card>

      <Card header="Contact details for public display">
        <p className="mb-4 text-sm text-fg-muted">These appear in the public registry, so use a desk that is answered — not a personal number.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Mobile number"
            inputMode="numeric"
            maxLength={10}
            value={draft.contact.facilityContactNumber ?? ""}
            error={errors.mobile}
            hint="Ten digits."
            disabled={readOnly}
            onChange={(e) => setNested("contact", "facilityContactNumber", e.target.value.replace(/\D/g, ""))}
          />
          <Field
            label="Landline number"
            inputMode="numeric"
            maxLength={8}
            value={draft.contact.facilityLandlineNumber ?? ""}
            error={errors.landline}
            hint="Six to eight digits, without the STD code."
            disabled={readOnly}
            onChange={(e) => setNested("contact", "facilityLandlineNumber", e.target.value.replace(/\D/g, ""))}
          />
          <Field
            label="STD code"
            inputMode="numeric"
            maxLength={8}
            value={draft.contact.facilityStdCode ?? ""}
            disabled={readOnly}
            onChange={(e) => setNested("contact", "facilityStdCode", e.target.value.replace(/\D/g, ""))}
          />
          <Field
            label="Email"
            type="email"
            value={draft.contact.facilityEmailId ?? ""}
            error={errors.email}
            disabled={readOnly}
            onChange={(e) => setNested("contact", "facilityEmailId", e.target.value)}
          />
          <Field
            label="Website"
            value={draft.contact.websiteLink ?? ""}
            hint="Include https://"
            disabled={readOnly}
            onChange={(e) => setNested("contact", "websiteLink", e.target.value)}
          />
        </div>
      </Card>

      <Card header="Systems of medicine">
        <p className="mb-4 text-sm text-fg-muted">A facility may practise more than one (HFR-034). Specialities are recorded against each.</p>
        <SystemsOfMedicine
          selected={draft.systemOfMedicineCodes}
          disabled={readOnly}
          error={errors.medicine}
          onChange={(codes) => set("systemOfMedicineCodes", codes)}
        />
      </Card>

      <Card header="Facility type">
        <p className="mb-4 text-sm text-fg-muted">
          HFR derives the available types from the ownership and systems of medicine chosen above, so those come
          first (HFR-035, HFR-036).
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <RegistryMasterSelect
            label="Facility type"
            kind="facilityType"
            required
            filters={{
              ownershipCode: draft.ownershipCode,
              // The registry takes one system of medicine here, not a list.
              systemOfMedicineCode: draft.systemOfMedicineCodes[0],
            }}
            parentHint="Choose an ownership and at least one system of medicine first"
            value={draft.facilityTypeCode}
            disabled={readOnly}
            hint={errors.facilityType}
            onChange={(v) => set("facilityTypeCode", v)}
          />
          <RegistryMasterSelect
            label="Facility sub-type"
            kind="facilitySubType"
            required
            filters={{ facilityTypeCode: draft.facilityTypeCode }}
            parentHint="Choose a facility type first"
            value={draft.facilitySubType}
            disabled={readOnly}
            onChange={(v) => set("facilitySubType", v)}
          />
        </div>
      </Card>

      <Card header="Medical infrastructure">
        <p className="mb-4 text-sm text-fg-muted">Bed and equipment counts as HFR asks for them. Leave blank rather than guessing.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BED_FIELDS.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              inputMode="numeric"
              maxLength={2}
              value={draft.infrastructure[f.key] ?? ""}
              disabled={readOnly}
              onChange={(e) => setNested("infrastructure", f.key, e.target.value.replace(/\D/g, "").slice(0, 2))}
            />
          ))}
          <Field
            label="Total ventilators"
            inputMode="numeric"
            maxLength={4}
            value={draft.infrastructure.totalNumberOfVentilators ?? ""}
            disabled={readOnly}
            hint={
              draft.infrastructure.totalNumberOfVentilators &&
              Number(draft.infrastructure.totalNumberOfVentilators) !== bedsWithVentilators
                ? `The beds above add up to ${bedsWithVentilators}. Check which is right.`
                : "Should match the ventilator beds above (HFR-057)."
            }
            onChange={(e) => setNested("infrastructure", "totalNumberOfVentilators", e.target.value.replace(/\D/g, ""))}
          />
          <Field
            label="Total beds"
            inputMode="numeric"
            maxLength={4}
            value={draft.infrastructure.totalNumberOfBeds ?? ""}
            disabled={readOnly}
            hint="Stated by you, not calculated (HFR-060)."
            onChange={(e) => setNested("infrastructure", "totalNumberOfBeds", e.target.value.replace(/\D/g, ""))}
          />
        </div>
      </Card>

      <Card header="Other programme identifiers">
        <p className="mb-4 text-sm text-fg-muted">All optional. Fill in only the ones this facility genuinely holds — a wrong number is worse than a blank.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {PROGRAMME_FIELDS.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              hint={f.hint}
              value={draft.programmeIds[f.key] ?? ""}
              disabled={readOnly}
              onChange={(e) => setNested("programmeIds", f.key, e.target.value)}
            />
          ))}
        </div>
      </Card>

      {/* A verified facility, sitting still. The only action is the deliberate one. */}
      {isVerified && !amending && canManage ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-fg-muted">
              This facility is registered. Its details can be corrected &mdash; beds, contacts, a rename &mdash; and the
              Facility ID stays the same.
            </p>
            <Button variant="secondary" onClick={() => setAmending(true)}>
              <Pencil className="size-4" aria-hidden /> Update details
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Amending. A different pair of buttons from registration, because it is a different act. */}
      {isVerified && amending ? (
        <Card>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setAmending(false);
                setErrors({});
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={sendUpdate} disabled={submitting}>
              <Send className="size-4" aria-hidden /> {submitting ? "Sending…" : "Send update to HFR"}
            </Button>
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            This changes what the national registry holds about this hospital. The Facility ID is not affected, and the
            registration does not go back into the verification queue.
          </p>
        </Card>
      ) : null}

      {!readOnly && !isVerified ? (
        <Card>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={save} disabled={saving || submitting}>
              <Save className="size-4" aria-hidden /> {saving ? "Saving…" : "Save draft"}
            </Button>
            <Button onClick={submit} disabled={saving || submitting}>
              <Send className="size-4" aria-hidden /> {submitting ? "Sending…" : "Submit to HFR"}
            </Button>
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            Submitting sends the registration for review by an HFR verifier. It cannot be edited again until they
            answer.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * Systems of medicine, and the specialities that hang off each (HFR-034, HFR-047…049).
 *
 * Specialities belong to a system of medicine, not to the facility — Ayurveda's list is not
 * Allopathy's — so unselecting a system must take its specialities with it. Doing otherwise leaves
 * orphaned codes in the payload that the registry will reject with a message naming neither.
 */
function SystemsOfMedicine({
  selected,
  disabled,
  error,
  onChange,
}: {
  selected: string[];
  disabled?: boolean;
  error?: string;
  onChange: (codes: string[]) => void;
}) {
  const [options, setOptions] = useState<api.AbdmMasterOption[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .abdmFacilityMaster("masterData", { type: "MEDICINE" })
      .then((list) => !cancelled && setOptions(list))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(code: string) {
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  }

  if (failed)
    return (
      <Alert tone="danger" title="The registry did not return the list of medicine systems">
        Try again shortly. Do not submit without choosing at least one.
      </Alert>
    );

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((o) => (
          <label key={o.code} className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={selected.includes(o.code)}
              disabled={disabled}
              onChange={() => toggle(o.code)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {error ? <span className="hms-field__error">{error}</span> : null}
      {options.length === 0 && !failed ? <Spinner /> : null}
    </>
  );
}
