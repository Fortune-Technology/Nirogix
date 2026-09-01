"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderPlus } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DateDisplay,
  Dialog,
  EmptyState,
  Field,
  Select,
  Skeleton,
  Textarea,
} from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { Department, PatientCase, Provider } from "@hms/types";
import * as api from "../../lib/api";
import { useCan } from "../../lib/auth";

/**
 * A patient's treatment cases on their chart (ADR-116).
 *
 * Open cases first and stated plainly, because the chart is the other place — besides check-in —
 * where somebody decides whether a new case is needed. Closed cases stay listed with the reason
 * they closed: an episode that ended is history, not clutter, and "why did this stop?" is a
 * question people genuinely ask months later.
 */
export function CasesCard({ patientId }: { patientId: string }) {
  const canView = useCan(PERMISSIONS.CASE_VIEW);
  const canManage = useCan(PERMISSIONS.CASE_MANAGE);

  const [cases, setCases] = useState<PatientCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [opening, setOpening] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [saving, setSaving] = useState(false);

  const [closing, setClosing] = useState<PatientCase | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [reopening, setReopening] = useState<PatientCase | null>(null);

  const load = useCallback(async () => {
    try {
      setCases(await api.listCases({ patientId }));
      setError(null);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Could not load this patient's cases.");
      setCases([]);
    }
  }, [patientId]);

  useEffect(() => {
    if (!canView) return;
    void load();
  }, [canView, load]);

  useEffect(() => {
    if (!opening) return;
    Promise.allSettled([api.listDepartments({ activeOnly: true }), api.listProviders()]).then(([d, p]) => {
      setDepartments(d.status === "fulfilled" ? d.value : []);
      setProviders(p.status === "fulfilled" ? p.value : []);
    });
  }, [opening]);

  if (!canView) return null;
  if (cases === null) return <Skeleton className="h-32" />;

  const open = cases.filter((c) => c.status === "open");
  const closed = cases.filter((c) => c.status !== "open");

  async function createCase() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api.openCase({
        patientId,
        title: title.trim(),
        notes: notes.trim() || undefined,
        departmentId: departmentId || undefined,
        providerId: providerId || undefined,
      });
      setOpening(false);
      setTitle("");
      setNotes("");
      setDepartmentId("");
      setProviderId("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function doClose() {
    if (!closing || !closeReason.trim()) return;
    setSaving(true);
    try {
      await api.closeCase(closing.id, { version: closing.version, closeReason: closeReason.trim() });
      setClosing(null);
      setCloseReason("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function doReopen() {
    if (!reopening) return;
    setSaving(true);
    try {
      await api.reopenCase(reopening.id, reopening.version);
      setReopening(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  function CaseRow({ c }: { c: PatientCase }) {
    const isOpen = c.status === "open";
    return (
      <li className="flex flex-wrap items-start gap-3 rounded-token border border-border px-3 py-3">
        <Badge tone={isOpen ? "brand" : "neutral"}>{c.caseNumber}</Badge>
        <div className="min-w-0 flex-1">
          <p className="text-fg">{c.title}</p>
          <p className="text-xs text-fg-muted">
            Opened <DateDisplay value={c.openedAt} />
            {c.visitCount > 0 && ` · ${c.visitCount} visit${c.visitCount === 1 ? "" : "s"}`}
            {c.lastVisitDate && (
              <>
                {" · last "}
                <DateDisplay value={c.lastVisitDate} />
              </>
            )}
            {c.providerName && ` · ${c.providerName}`}
            {c.departmentName && ` · ${c.departmentName}`}
          </p>
          {/* Why it closed is the thing someone reading this months later actually needs. */}
          {!isOpen && c.closeReason && (
            <p className="mt-1 text-xs text-fg-subtle">
              Closed {c.closedAt && <DateDisplay value={c.closedAt} />}: {c.closeReason}
            </p>
          )}
          {c.notes && <p className="mt-1 text-xs text-fg-subtle">{c.notes}</p>}
        </div>
        {canManage && (
          <Button
            size="sm"
            variant="secondary"
            type="button"
            onClick={() => (isOpen ? setClosing(c) : setReopening(c))}
          >
            {isOpen ? "Close case" : "Reopen"}
          </Button>
        )}
      </li>
    );
  }

  return (
    <>
      <Card
        header={
          <div className="flex items-center justify-between gap-3">
            <span>Treatment cases</span>
            {canManage && (
              <Button size="sm" type="button" onClick={() => setOpening(true)}>
                <FolderPlus size={16} strokeWidth={2} /> New case
              </Button>
            )}
          </div>
        }
      >
        {error && <Alert tone="danger">{error}</Alert>}

        {cases.length === 0 ? (
          <EmptyState
            title="No treatment cases"
            description="A case groups the visits that belong to one course of treatment. Most one-off consultations do not need one."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {open.length > 0 && (
              <ul className="flex flex-col gap-2">
                {open.map((c) => (
                  <CaseRow key={c.id} c={c} />
                ))}
              </ul>
            )}
            {closed.length > 0 && (
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-fg-subtle">Closed</p>
                <ul className="flex flex-col gap-2">
                  {closed.map((c) => (
                    <CaseRow key={c.id} c={c} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>

      <Dialog
        open={opening}
        onClose={() => setOpening(false)}
        title="Open a treatment case"
        description="Groups the visits that belong to one course of treatment."
        busy={saving}
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setOpening(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" loading={saving} onClick={() => void createCase()} disabled={!title.trim()}>
              Open case
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {open.length > 0 && (
            <Alert tone="neutral">
              This patient already has {open.length} open {open.length === 1 ? "case" : "cases"}. Check that this is
              genuinely something different before opening another.
            </Alert>
          )}
          <Field
            label="What is this case for?"
            value={title}
            required
            autoFocus
            maxLength={200}
            placeholder="Fracture right tibia, Antenatal care, Diabetes management…"
            onChange={(e) => setTitle(e.target.value)}
            hint="In words the patient would recognise. Not a diagnosis — the doctor codes that in the consultation."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Department"
              value={departmentId}
              onChange={setDepartmentId}
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
              placeholder="Not specified"
              clearable
            />
            <Select
              label="Doctor"
              value={providerId}
              onChange={setProviderId}
              options={providers
                .filter((p) => p.isActive)
                .map((p) => ({
                  value: p.id,
                  label: p.fullName,
                  description: p.specialties.length > 0 ? p.specialties.join(", ") : undefined,
                }))}
              placeholder="Not specified"
              clearable
            />
          </div>
          <Textarea
            label="Notes"
            value={notes}
            rows={2}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
            hint="Optional — anything the next person opening this case should know."
          />
        </div>
      </Dialog>

      <Dialog
        open={closing !== null}
        onClose={() => setClosing(null)}
        title={closing ? `Close ${closing.caseNumber}` : "Close case"}
        description="The case and its visits are kept. Closing says the course of treatment is finished."
        busy={saving}
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setClosing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" loading={saving} onClick={() => void doClose()} disabled={!closeReason.trim()}>
              Close case
            </Button>
          </>
        }
      >
        <Textarea
          label="Why is it being closed?"
          value={closeReason}
          rows={3}
          required
          maxLength={300}
          autoFocus
          onChange={(e) => setCloseReason(e.target.value)}
          placeholder="Treatment completed, patient discharged, referred elsewhere…"
          hint="Required — a case marked closed with no reason is unreadable to whoever opens the chart next."
        />
      </Dialog>

      <ConfirmDialog
        open={reopening !== null}
        onCancel={() => setReopening(null)}
        onConfirm={() => void doReopen()}
        title={reopening ? `Reopen ${reopening.caseNumber}?` : "Reopen case"}
        description="Every visit already under this case is kept. Reopening is the right move when treatment resumes — opening a second case for the same episode splits the history in two."
        confirmLabel="Reopen case"
        busy={saving}
      />
    </>
  );
}
