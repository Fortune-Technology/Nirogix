"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  DateDisplay,
  DateTimeDisplay,
  EmptyState,
  Select,
  Spinner,
  toast,
} from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import { AlertTriangle, Download, Hospital, RefreshCw } from "lucide-react";
import type { Patient, Provider } from "@hms/types";
import * as api from "../../lib/api";
import { useCan } from "../../lib/auth";

/**
 * A patient's history from other hospitals (ADR-092…ADR-094).
 *
 * The only place in the Portal that touches ABDM Milestone 3, and it is deliberately quiet about
 * what it cannot do. Three things shape it:
 *
 * - **It never claims records exist that we do not hold.** Consent is asked for, and then the
 *   patient decides in their own app — which may take minutes, or never happen. So the card shows
 *   the honest in-between state ("waiting for the patient") rather than a spinner that implies
 *   something is arriving.
 * - **A record that disappears is normal, not an error.** When a consent is revoked or expires the
 *   entries vanish from this list, because the backend stops returning them the moment the
 *   permission lapses. The card says so in words rather than leaving a doctor wondering.
 * - **Nothing here interprets the records.** An "Abnormal" badge appears only where the source
 *   hospital's own data said so; the card renders what the API returns and adds no judgement.
 */

/** How often to re-check a request the patient has not answered yet. */
const POLL_MS = 15_000;
/** Give up polling after this long — a patient who has not answered in ten minutes may never. */
const POLL_CEILING_MS = 10 * 60_000;

const STATUS_LABEL: Record<string, string> = {
  pending: "Sending",
  requested: "Waiting for the patient",
  granted: "Consent granted",
  denied: "Patient declined",
  expired: "Request expired",
  failed: "Could not be sent",
};

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  pending: "neutral",
  requested: "warning",
  granted: "success",
  denied: "danger",
  expired: "neutral",
  failed: "danger",
};

const TYPE_LABEL: Record<string, string> = {
  OPConsultation: "OP consultation",
  Prescription: "Prescription",
  DiagnosticReport: "Diagnostic report",
  DischargeSummary: "Discharge summary",
  ImmunizationRecord: "Immunisation record",
  HealthDocumentRecord: "Health document",
  WellnessRecord: "Wellness record",
};

export function ExternalHistoryCard({ patient }: { patient: Patient }) {
  const canRequest = useCan(PERMISSIONS.ABDM_HISTORY_REQUEST);
  const canView = useCan(PERMISSIONS.ABDM_HISTORY_VIEW);

  const [requests, setRequests] = useState<api.AbdmHistoryRequest[]>([]);
  const [timeline, setTimeline] = useState<api.AbdmTimeline | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerId, setProviderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const pollStartedAt = useRef<number | null>(null);

  // Only a verified ABHA can be used: a hand-typed identifier was never proved to be this
  // patient's, and asking a national consent manager to act on one could surface a stranger's
  // history. The card explains that rather than showing a button that always fails.
  const verified = Boolean(patient.abhaAddress && patient.abhaVerifiedAt);

  const load = useCallback(async () => {
    if (!canView) return;
    const [reqs, tl] = await Promise.all([
      api.listAbdmHistoryRequests(patient.id).catch(() => [] as api.AbdmHistoryRequest[]),
      api.getAbdmTimeline(patient.id).catch(() => null),
    ]);
    setRequests(reqs);
    setTimeline(tl);
    setLoading(false);
  }, [patient.id, canView]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canRequest || providers.length > 0) return;
    api
      .listProviders()
      .then((all) => {
        // Only doctors who can actually be named on a request — the registration number is what the
        // patient reads when deciding, and the API refuses without one.
        const eligible = all.filter((p) => p.isActive && p.registrationNumber);
        setProviders(eligible);
        setProviderId((current) => current || eligible[0]?.id || "");
      })
      .catch(() => {});
  }, [canRequest, providers.length]);

  const waiting = useMemo(() => requests.some((r) => r.status === "requested" || r.status === "pending"), [requests]);

  // Poll only while something is genuinely outstanding, and stop after a ceiling. A consent the
  // patient never opens must not leave a tab polling for the rest of the day.
  useEffect(() => {
    if (!waiting) {
      pollStartedAt.current = null;
      return;
    }
    pollStartedAt.current ??= Date.now();
    const timer = setInterval(() => {
      if (pollStartedAt.current && Date.now() - pollStartedAt.current > POLL_CEILING_MS) return;
      void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, load]);

  const granted = requests.filter((r) => r.status === "granted");

  async function askForConsent() {
    if (!providerId) return;
    setBusy(true);
    try {
      await api.requestAbdmHistory({ patientId: patient.id, providerId });
      toast.info("Consent requested. The patient decides in their own ABHA app.");
      await load();
    } catch {
      // The shared client already raised the backend's own message (ADR-026/057).
    } finally {
      setBusy(false);
    }
  }

  async function pullRecords() {
    setBusy(true);
    try {
      const result = await api.fetchAbdmExternalRecords(patient.id);
      // Honest about the asynchrony: the records arrive on a push, not on this response.
      toast.info(
        result.requested === 0
          ? "No granted consent to fetch from yet."
          : `Requested records from ${result.requested} hospital${result.requested === 1 ? "" : "s"}. They arrive shortly.`,
      );
      await load();
    } catch {
      /* handled by the shared client */
    } finally {
      setBusy(false);
    }
  }

  async function refresh(requestId: string) {
    setBusy(true);
    try {
      await api.refreshAbdmHistoryRequest(requestId);
      await load();
    } catch {
      /* handled by the shared client */
    } finally {
      setBusy(false);
    }
  }

  if (!canView) return null;

  return (
    <Card
      header={
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Hospital className="size-4 text-fg-muted" aria-hidden />
            History from other hospitals
          </span>
          {timeline && timeline.summary.total > 0 && (
            <Badge tone="neutral">
              {timeline.summary.total} record{timeline.summary.total === 1 ? "" : "s"} from{" "}
              {timeline.summary.sources.length} source{timeline.summary.sources.length === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
      }
    >
      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : !verified ? (
        <Alert>
          This patient has no verified ABHA address, so their history at other hospitals cannot be requested. Verify
          their ABHA first.
        </Alert>
      ) : (
        <div className="space-y-4">
          {/* --- Asking ------------------------------------------------------------------ */}
          {canRequest && (
            <div className="flex flex-wrap items-end gap-2">
              {providers.length > 0 ? (
                <Select
                  label="Requesting doctor"
                  value={providerId}
                  onChange={(v) => v && setProviderId(v)}
                  options={providers.map((p) => ({
                    value: p.id,
                    label: p.fullName,
                    description: p.registrationNumber ?? undefined,
                    keywords: p.registrationNumber ?? undefined,
                  }))}
                  hint="The patient sees this name and registration number"
                />
              ) : (
                <Alert>
                  No doctor on record has a medical registration number. ABDM requires one — the patient reads it when
                  deciding whether to share their history. Add it on the doctor’s profile.
                </Alert>
              )}
              {providers.length > 0 && (
                <Button onClick={askForConsent} disabled={busy || !providerId}>
                  Request patient consent
                </Button>
              )}
              {granted.length > 0 && (
                <Button variant="secondary" onClick={pullRecords} disabled={busy}>
                  <Download className="size-4" aria-hidden />
                  Fetch records
                </Button>
              )}
            </div>
          )}

          {/* --- Outstanding requests ---------------------------------------------------- */}
          {requests.length > 0 && (
            <ul className="space-y-2">
              {requests.slice(0, 4).map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                    <span className="text-fg-muted">
                      asked by {r.requesterName} on <DateDisplay value={r.createdAt} />
                    </span>
                  </span>
                  {(r.status === "requested" || r.status === "pending") && (
                    <Button variant="ghost" size="sm" onClick={() => void refresh(r.id)} disabled={busy}>
                      <RefreshCw className="size-4" aria-hidden />
                      Check now
                    </Button>
                  )}
                  {r.status === "failed" && r.lastError && (
                    <span className="text-xs text-danger">{r.lastError}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {waiting && (
            <p className="text-xs text-fg-muted">
              The patient grants or declines in their own ABHA app. Nothing arrives until they do.
            </p>
          )}

          {/* --- The merged timeline ----------------------------------------------------- */}
          {timeline && timeline.entries.length > 0 ? (
            <div className="space-y-3">
              {timeline.summary.abnormalCount > 0 && (
                <Alert className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-warning" aria-hidden />
                  <span>
                    {timeline.summary.abnormalCount} record
                    {timeline.summary.abnormalCount === 1 ? " carries" : "s carry"} a finding the source hospital
                    marked abnormal.
                  </span>
                </Alert>
              )}
              <ol className="space-y-3">
                {timeline.entries.map((entry) => (
                  <TimelineItem key={entry.id} entry={entry} />
                ))}
              </ol>
              <p className="text-xs text-fg-muted">
                Held with the patient’s consent. These records disappear from this list the moment that consent is
                withdrawn or expires, and our copy is deleted.
              </p>
            </div>
          ) : (
            requests.length > 0 &&
            !waiting && (
              <EmptyState
                title="No records yet"
                description="Nothing has been shared under a current consent. Records also disappear here once a consent is withdrawn or expires."
              />
            )
          )}

          {requests.length === 0 && (
            <EmptyState
              title="No history requested"
              description="Ask the patient for permission to see the records other hospitals hold for them."
            />
          )}
        </div>
      )}
    </Card>
  );
}

/** One event, from one hospital, on one date. */
function TimelineItem({ entry }: { entry: api.AbdmTimelineEntry }) {
  const groups = entry.details.reduce<Record<string, api.AbdmTimelineDetail[]>>((acc, detail) => {
    (acc[detail.group] ??= []).push(detail);
    return acc;
  }, {});

  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-fg">{entry.title}</span>
          <Badge tone="neutral">{TYPE_LABEL[entry.hiType] ?? entry.hiType}</Badge>
          {entry.hasAbnormalFinding && <Badge tone="warning">Abnormal finding</Badge>}
        </span>
        <span className="text-xs text-fg-muted">
          {entry.date ? <DateDisplay value={entry.date} /> : <>Received <DateTimeDisplay value={entry.receivedAt} /></>}
        </span>
      </div>

      {/* The author and the facility id are often the same string when a source names itself as
          its own organisation; printing it twice looks like a rendering fault. */}
      <p className="mt-1 text-xs text-fg-muted">
        {[entry.author, entry.sourceHipId].filter(Boolean).filter((v, i, all) => all.indexOf(v) === i).join(" · ") ||
          "Another facility"}
      </p>

      {Object.entries(groups).map(([group, details]) => (
        <div key={group} className="mt-2">
          <p className="text-xs font-medium text-fg-muted">{group}</p>
          <ul className="mt-1 space-y-0.5">
            {details.map((detail, i) => (
              <li key={`${detail.label}-${i}`} className="text-sm text-fg">
                <span className="text-fg-muted">{detail.label}:</span>{" "}
                <span className={detail.emphasis === "abnormal" ? "font-medium text-warning" : undefined}>
                  {detail.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </li>
  );
}
