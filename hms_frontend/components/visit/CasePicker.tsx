"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Field, Select, Skeleton, Textarea } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import { formatDate } from "@hms/utils";
import type { PatientCase } from "@hms/types";
import * as api from "../../lib/api";
import { useCan } from "../../lib/auth";

/**
 * How this visit relates to a course of treatment (ADR-116).
 *
 * Three answers, and the middle one is the whole point of the feature:
 *
 * - **No case** — a one-off consultation. The default, because most visits are one, and forcing a
 *   case on every walk-in would fill the chart with one-visit episodes nobody ever closes.
 * - **An existing open case** — the patient is coming back about something already being treated.
 * - **A new case** — the start of something that will take more than one visit.
 *
 * A patient's open cases are **loaded and shown as soon as a patient is chosen**, before anyone
 * decides anything. Accidental duplicates come from not knowing a case already exists, so the
 * remedy is to make it impossible to miss rather than to refuse the second one — a diabetic being
 * managed long-term who breaks an ankle genuinely has two.
 */

export type CaseChoice =
  | { kind: "none" }
  | { kind: "existing"; caseId: string }
  | { kind: "new"; title: string; notes: string };

export const NO_CASE: CaseChoice = { kind: "none" };

export interface CasePickerProps {
  patientId: string | null;
  value: CaseChoice;
  onChange: (next: CaseChoice) => void;
  /**
   * The desk said this is a follow-up, so an open case is the likely answer and is preselected.
   * Only ever a starting point — it is still the user's choice.
   */
  preferExisting?: boolean;
  disabled?: boolean;
}

export function CasePicker({ patientId, value, onChange, preferExisting, disabled }: CasePickerProps) {
  const canView = useCan(PERMISSIONS.CASE_VIEW);
  const canManage = useCan(PERMISSIONS.CASE_MANAGE);

  const [openCases, setOpenCases] = useState<PatientCase[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!patientId || !canView) {
      setOpenCases(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .listCases({ patientId, status: "open" })
      .then((cases) => {
        if (cancelled) return;
        setOpenCases(cases);
      })
      // A failure to load leaves the picker on "no case" rather than blocking check-in. The visit
      // matters more than the episode, and a case can be attached from the chart afterwards.
      .catch(() => !cancelled && setOpenCases([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [patientId, canView]);

  // Preselect the most recent open case for a follow-up — which is what a follow-up almost always
  // is — but only when the user has not already answered.
  useEffect(() => {
    if (!preferExisting || value.kind !== "none") return;
    const latest = openCases?.[0];
    if (latest) onChange({ kind: "existing", caseId: latest.id });
  }, [preferExisting, openCases, value.kind, onChange]);

  if (!canView) return null;

  if (!patientId) {
    return <p className="text-sm text-fg-muted">Choose a patient first to see what they are being treated for.</p>;
  }

  if (loading && openCases === null) return <Skeleton className="h-20" />;

  const cases = openCases ?? [];
  const options = [
    { value: "none", label: "Not part of a case", description: "A one-off consultation" },
    ...cases.map((c) => ({
      value: c.id,
      label: c.title,
      description: `${c.caseNumber} · opened ${formatDate(c.openedAt)}${
        c.visitCount > 0 ? ` · ${c.visitCount} visit${c.visitCount === 1 ? "" : "s"}` : ""
      }`,
      meta: c.providerName ?? c.departmentName ?? undefined,
      keywords: `${c.caseNumber} ${c.departmentName ?? ""} ${c.providerName ?? ""}`,
    })),
    ...(canManage ? [{ value: "new", label: "Start a new case", description: "This will take more than one visit" }] : []),
  ];

  const selected = value.kind === "existing" ? value.caseId : value.kind;

  return (
    <div className="flex flex-col gap-4">
      {/* Stated before the control, not after it: knowing a case is already open is what stops a
          second one being opened for the same thing. */}
      {cases.length > 0 && (
        <Alert tone="neutral">
          This patient has {cases.length} open {cases.length === 1 ? "case" : "cases"}:{" "}
          {cases.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ", "}
              <Badge tone="brand">{c.caseNumber}</Badge> {c.title}
            </span>
          ))}
          . Check them in under the right one rather than starting another.
        </Alert>
      )}

      <Select
        label="Treatment case"
        value={selected}
        onChange={(v) => {
          if (v === "none" || v === "") onChange({ kind: "none" });
          else if (v === "new") onChange({ kind: "new", title: "", notes: "" });
          else onChange({ kind: "existing", caseId: v });
        }}
        options={options}
        searchable={cases.length > 5}
        disabled={disabled}
        hint={
          cases.length === 0
            ? "Nothing is currently open for this patient."
            : "Pick the case this visit belongs to, or leave it as a one-off."
        }
      />

      {value.kind === "new" && (
        <div className="flex flex-col gap-4 rounded-token border border-border p-4">
          <Field
            label="What is this case for?"
            value={value.title}
            required
            maxLength={200}
            placeholder="Fracture right tibia, Antenatal care, Diabetes management…"
            disabled={disabled}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
            hint="In words the patient would recognise. Not a diagnosis — the doctor codes that in the consultation."
          />
          <Textarea
            label="Notes"
            value={value.notes}
            rows={2}
            maxLength={2000}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, notes: e.target.value })}
            hint="Optional — anything the next person opening this case should know."
          />
        </div>
      )}
    </div>
  );
}
