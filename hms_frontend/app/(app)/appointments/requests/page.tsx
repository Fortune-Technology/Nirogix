"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import {
  actionsColumn,
  Alert,
  Badge,
  Button,
  DataTable,
  DateField,
  Dialog,
  emptyLabel,
  Field,
  Select,
  Skeleton,
  TableAction,
  TableActions,
  Textarea,
  TimeField,
  type Column,
  valueLabel,
  ValueOrEmpty,
} from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type {
  ApproveBookingRequest,
  BookingRequestItem,
  DuplicatePatientCandidate,
  FreeSlots,
  Provider,
} from "@hms/types";
import { formatDate, formatDateTime, formatTime, todayApiDate } from "@hms/utils";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";
import { PageHeader } from "../../../../components/PageHeader";
import { useCan } from "../../../../lib/auth";

/**
 * The online-booking review queue (ADR-069).
 *
 * This is where a *request* becomes an *appointment*. Nothing before this point has
 * booked anything: the visitor stated a wish (a name, a phone, a preferred time, a
 * department), and the desk picks the real doctor and the real slot here — through the
 * same roster and double-booking rules as booking by hand, and through the same
 * DUPLICATE_PATIENT gate as every other registration, so one person keeps one chart.
 *
 * Two permissions, deliberately: **seeing** the queue rides `appointment.booking.view`,
 * so anyone who can read the appointment book can tell whether anything arrived.
 * **Approving or rejecting** is `appointment.booking.create` — the same permission as
 * booking by hand — and the server re-checks regardless.
 */

const STATUSES = ["pending", "approved", "rejected"] as const;
type Status = (typeof STATUSES)[number];

function name(r: BookingRequestItem): string {
  return [r.firstName, r.lastName].filter(Boolean).join(" ");
}

/** The visitor's wish, shown per ADR-046 — the time is anchored to an arbitrary day
 * purely to render `HH:mm` as `hh:mm AM/PM`. */
function preferredWhen(r: BookingRequestItem): string {
  const date = r.preferredDate ? formatDate(r.preferredDate) : null;
  const time = r.preferredTime ? formatTime(`2000-01-01T${r.preferredTime}:00`) : null;
  if (date && time) return `${date}, ${time}`;
  return date ?? time ?? emptyLabel("unspecified");
}

function statusTone(s: string): "warning" | "success" | "danger" | "neutral" {
  if (s === "pending") return "warning";
  if (s === "approved") return "success";
  if (s === "rejected") return "danger";
  return "neutral";
}

function columns(
  canReview: boolean,
  busyId: string | null,
  onApprove: (r: BookingRequestItem) => void,
  onReject: (r: BookingRequestItem) => void,
): Array<Column<BookingRequestItem>> {
  return [
    {
      key: "name",
      header: "Name",
      sortable: true,
      hideable: false,
      accessor: name,
      cell: (r) => <span className="font-medium text-fg">{name(r)}</span>,
    },
    { key: "phone", header: "Phone", accessor: (r) => r.phone, cell: (r) => r.phone },
    {
      key: "preferred",
      header: "Preferred",
      accessor: (r) => `${r.preferredDate ?? ""} ${r.preferredTime ?? ""}`.trim(),
      cell: (r) => preferredWhen(r),
    },
    {
      key: "department",
      header: "Department wish",
      filterable: true,
      // The public form lets a patient ask for "any doctor, any department" — a blank here is
      // the patient's answer, not a gap in the data.
      accessor: (r) => valueLabel(r.departmentName, "unspecified"),
      cell: (r) => <ValueOrEmpty value={r.departmentName} reason="unspecified" />,
    },
    {
      key: "doctor",
      header: "Doctor wish",
      filterable: true,
      accessor: (r) => valueLabel(r.providerName, "unspecified"),
      cell: (r) => <ValueOrEmpty value={r.providerName} reason="unspecified" />,
    },
    {
      key: "note",
      header: "Note",
      // A free-text note the visitor wrote; it can run long, so it is off by default
      // to keep the review queue scannable — the reviewer restores it from the Columns
      // menu (ADR-063: a hidden-by-default column must state why).
      defaultHidden: true,
      accessor: (r) => r.note ?? "",
      cell: (r) => <ValueOrEmpty value={r.note} reason="none" className="text-fg-muted" />,
    },
    {
      key: "createdAt",
      header: "Received",
      sortable: true,
      accessor: (r) => r.createdAt,
      cell: (r) => formatDateTime(r.createdAt),
    },
    {
      key: "status",
      header: "Status",
      accessor: (r) => r.status,
      cell: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge>,
    },
    actionsColumn<BookingRequestItem>((r) => (
      <TableActions label={`Actions for ${name(r)}`}>
        <TableAction
          label="Approve & book"
          icon={<Check size={16} strokeWidth={2} aria-hidden />}
          permitted={canReview && r.status === "pending"}
          loading={busyId === r.id}
          onSelect={() => onApprove(r)}
        />
        <TableAction
          label="Reject"
          icon={<X size={16} strokeWidth={2} aria-hidden />}
          tone="danger"
          permitted={canReview && r.status === "pending"}
          loading={busyId === r.id}
          onSelect={() => onReject(r)}
        />
      </TableActions>
    )),
  ];
}

function RequestsQueue() {
  const canReview = useCan(PERMISSIONS.APPOINTMENT_CREATE);
  const [status, setStatus] = useState<Status>("pending");
  const [rows, setRows] = useState<BookingRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listBookingRequests(status));
      setError(null);
    } catch {
      setError("Could not load booking requests.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  // The approve dialog books against a real doctor, so the active directory is loaded
  // once — and only for someone who can actually approve.
  useEffect(() => {
    if (!canReview) return;
    api
      .listProviders()
      .then((all) => setProviders(all.filter((p) => p.isActive)))
      .catch(() => setProviders([]));
  }, [canReview]);

  // ---- Approve: pick the real doctor and the real slot -----------------------

  const [approveFor, setApproveFor] = useState<BookingRequestItem | null>(null);
  const [providerId, setProviderId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<FreeSlots | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotIso, setSlotIso] = useState("");
  const [time, setTime] = useState<string | null>(null);
  const [duration, setDuration] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function openApprove(r: BookingRequestItem) {
    setApproveFor(r);
    // Start from the visitor's wish where it is still usable — the desk can change both.
    setProviderId(r.providerId && providers.some((p) => p.id === r.providerId) ? r.providerId : "");
    setDate(r.preferredDate && r.preferredDate >= todayApiDate() ? r.preferredDate : "");
    setSlots(null);
    setSlotIso("");
    setTime(r.preferredTime ?? null);
    setDuration("");
    setFormError(null);
  }

  function closeApprove() {
    if (!busy) setApproveFor(null);
  }

  // The doctor's free slots for the chosen day. `hasRoster: false` means the doctor has
  // no schedule windows that day, so the desk types the time itself instead.
  useEffect(() => {
    if (!approveFor || !providerId || !date) {
      setSlots(null);
      setSlotIso("");
      return;
    }
    let alive = true;
    setSlotsLoading(true);
    setSlotIso("");
    api
      .listProviderSlots(providerId, date)
      .then((s) => {
        if (alive) setSlots(s);
      })
      .catch(() => {
        if (alive) setSlots(null);
      })
      .finally(() => {
        if (alive) setSlotsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [approveFor, providerId, date]);

  const scheduledAt = useMemo(() => {
    if (!date) return null;
    if (slots?.hasRoster) return slotIso || null;
    if (!time) return null;
    const d = new Date(`${date}T${time}:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }, [date, slots, slotIso, time]);

  const [dup, setDup] = useState<{
    request: BookingRequestItem;
    payload: ApproveBookingRequest;
    candidates: DuplicatePatientCandidate[];
  } | null>(null);

  async function send(r: BookingRequestItem, payload: ApproveBookingRequest) {
    setBusy(true);
    setBusyId(r.id);
    try {
      await api.approveBookingRequest(r.id, payload);
      setApproveFor(null);
      setDup(null);
      await load();
    } catch (err) {
      // A DUPLICATE_PATIENT 409 on approval: the person very likely already has a chart.
      if (err instanceof api.ApiRequestError && err.code === "DUPLICATE_PATIENT") {
        const details = err.details as { candidates?: DuplicatePatientCandidate[] } | undefined;
        setApproveFor(null);
        setDup({ request: r, payload, candidates: details?.candidates ?? [] });
      }
      /* other failures are reported by the shared API-feedback layer; the dialog stays open */
    } finally {
      setBusy(false);
      setBusyId(null);
    }
  }

  function submitApprove() {
    if (!approveFor) return;
    setFormError(null);
    if (!providerId) {
      setFormError("Select a doctor.");
      return;
    }
    if (!date) {
      setFormError("Pick a date.");
      return;
    }
    if (!scheduledAt) {
      setFormError(slots?.hasRoster ? "Pick a free slot." : "Enter a time.");
      return;
    }
    const dur = duration.trim() === "" ? undefined : Number(duration);
    if (dur !== undefined && (!Number.isInteger(dur) || dur < 5 || dur > 240)) {
      setFormError("Duration must be a whole number of minutes between 5 and 240.");
      return;
    }
    void send(approveFor, { scheduledAt, providerId, durationMinutes: dur });
  }

  // ---- Reject: keep the request, marked, with the reason ---------------------

  const [rejectFor, setRejectFor] = useState<BookingRequestItem | null>(null);
  const [reason, setReason] = useState("");

  function openReject(r: BookingRequestItem) {
    setRejectFor(r);
    setReason("");
  }

  async function submitReject() {
    if (!rejectFor) return;
    setBusy(true);
    setBusyId(rejectFor.id);
    try {
      await api.rejectBookingRequest(rejectFor.id, reason.trim() || undefined);
      setRejectFor(null);
      setReason("");
      await load();
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setBusy(false);
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Booking requests"
        description={loading ? "Loading…" : `${rows.length} ${status}`}
      />
      <Select
        label="Status"
        value={status}
        onChange={(v) => setStatus(v as Status)}
        options={STATUSES.map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) }))}
        searchable={false}
        aria-label="Show requests by status"
        className="w-56"
      />

      <Alert>
        These people scanned your hospital&apos;s booking QR code or link and asked for an appointment. They are{" "}
        <strong className="font-medium">not booked yet</strong>.{" "}
        {canReview
          ? "Check the details, then approve with the real doctor and slot, or reject with a reason."
          : "Your front desk reviews each one and books the actual appointment."}
      </Alert>

      <DataTable
        columns={columns(canReview, busyId, openApprove, openReject)}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        searchPlaceholder="Search by name or phone…"
        emptyMessage={status === "pending" ? "Nothing waiting" : `No ${status} requests`}
        emptyDescription="Requests appear here when someone scans your hospital's booking QR code and asks for an appointment."
        urlState
      />

      {/* Approving books a real appointment: the desk picks the doctor and the actual
          slot — the visitor's preference was only a wish. */}
      <Dialog
        open={approveFor !== null}
        onClose={closeApprove}
        title={approveFor ? `Book ${name(approveFor)}'s appointment` : "Book appointment"}
        description="Approving registers or links the patient and books a real appointment. The same roster and double-booking rules as booking by hand."
        size="md"
        busy={busy}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" type="button" onClick={closeApprove} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={submitApprove} loading={busy}>
              Approve &amp; book
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {formError && <Alert tone="danger">{formError}</Alert>}

          {approveFor &&
          (approveFor.preferredDate || approveFor.preferredTime || approveFor.departmentName || approveFor.providerName) ? (
            <p className="text-xs text-fg-muted">
              They asked for {preferredWhen(approveFor)}
              {approveFor.departmentName ? ` · ${approveFor.departmentName}` : ""}
              {approveFor.providerName ? ` · ${approveFor.providerName}` : ""}.
            </p>
          ) : null}

          <Select
            label="Doctor"
            value={providerId}
            onChange={setProviderId}
            options={providers.map((p) => ({
              value: p.id,
              label: p.fullName,
              description: p.specialties.length > 0 ? p.specialties.join(", ") : (p.qualification ?? undefined),
              keywords: p.specialties.join(" "),
            }))}
            placeholder="Select a doctor…"
            required
            emptyMessage="No doctors found."
          />

          <DateField label="Date" value={date || null} min={todayApiDate()} onChange={(v) => setDate(v ?? "")} required />

          {providerId && date ? (
            slotsLoading ? (
              <Skeleton height="2.5rem" />
            ) : slots?.hasRoster ? (
              slots.slots.length > 0 ? (
                <div className="hms-field">
                  <span className="hms-label">Free slots</span>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Free slots">
                    {slots.slots.map((s) => (
                      <button
                        key={s.startsAt}
                        type="button"
                        aria-pressed={slotIso === s.startsAt}
                        onClick={() => setSlotIso(s.startsAt)}
                        className={[
                          "rounded-token border px-3 py-1.5 text-sm transition-colors",
                          slotIso === s.startsAt
                            ? "border-brand bg-brand-subtle font-medium text-brand"
                            : "border-border bg-surface text-fg hover:border-brand",
                        ].join(" ")}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <Alert>No free slots for this doctor on that day. Pick another date.</Alert>
              )
            ) : (
              <TimeField
                label="Time"
                value={time}
                onChange={setTime}
                required
                hint="This doctor has no roster for that day, so pick the time yourself."
              />
            )
          ) : null}

          <Field
            label="Duration (minutes)"
            type="number"
            min={5}
            max={240}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="Doctor's default"
            hint="Optional. Leave empty to use the standard duration."
          />
        </div>
      </Dialog>

      {/* The duplicate gate on approval: link the request to the chart that already
          exists (no second record), or knowingly create a new one. */}
      <Dialog
        open={dup !== null}
        onClose={() => setDup(null)}
        title="Probably already registered"
        description="A chart matching this request's phone and name exists. Linking keeps one chart per person. The appointment is booked either way."
        size="md"
        busy={busy}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setDup(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              type="button"
              disabled={busy}
              onClick={() => {
                const d = dup!;
                void send(d.request, { ...d.payload, allowDuplicate: true });
              }}
            >
              Create a new chart anyway
            </Button>
          </div>
        }
      >
        <ul className="flex flex-col divide-y divide-border text-sm">
          {(dup?.candidates ?? []).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <span className="font-medium text-fg">{[c.firstName, c.lastName].filter(Boolean).join(" ")}</span>
                <span className="ml-2 font-mono text-xs text-fg-muted">{c.uhid}</span>
                <p className="text-xs text-fg-muted">
                  {c.phone ?? "no phone"} · {c.dateOfBirth ? formatDate(c.dateOfBirth) : "DOB unknown"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link href={`/patients/${c.id}`} target="_blank">
                  <Button size="sm" variant="ghost">
                    View
                  </Button>
                </Link>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    const d = dup!;
                    void send(d.request, { ...d.payload, existingPatientId: c.id });
                  }}
                >
                  Link this chart
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Dialog>

      {/* Rejecting keeps the request, marked, so it can be accounted for later. */}
      <Dialog
        open={rejectFor !== null}
        onClose={() => {
          if (!busy) setRejectFor(null);
        }}
        title={rejectFor ? `Reject ${name(rejectFor)}'s request?` : "Reject request"}
        description="No appointment is booked and no patient record is created. The request is kept, marked rejected."
        size="sm"
        tone="danger"
        busy={busy}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setRejectFor(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" type="button" onClick={() => void submitReject()} loading={busy}>
              Reject
            </Button>
          </div>
        }
      >
        <Textarea
          label="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={300}
          hint="Kept with the request for the record. Nothing is sent to the visitor automatically."
        />
      </Dialog>
    </>
  );
}

export default function BookingRequestsPage() {
  return (
    <RequirePermission perm={PERMISSIONS.APPOINTMENT_VIEW}>
      <RequestsQueue />
    </RequirePermission>
  );
}
