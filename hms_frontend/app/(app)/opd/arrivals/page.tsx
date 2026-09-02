"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import {
  actionsColumn,
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  TableAction,
  TableActions,
  Textarea,
  type Column,
  valueLabel,
} from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import { formatTime } from "@hms/utils";
import type { SelfCheckinRequest } from "@hms/types";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";
import { PageHeader } from "../../../../components/PageHeader";
import { useCan } from "../../../../lib/auth";

/**
 * The arrivals board (ADR-118) — patients who have told the hospital they are here.
 *
 * **Nothing on this board is a check-in yet.** Confirming a row runs the ordinary check-in, which
 * is deliberate: the public path buys the patient a shorter queue, not a way around the permission
 * that governs creating a visit. Confirming is also the identity check — the person is standing
 * there.
 *
 * An arrival the system could not match to an appointment stays on the board rather than being
 * dropped. It is a person in the lobby, and "we could not find you" is something a human needs to
 * handle, not something to hide because the lookup failed.
 */
function ArrivalsBoard() {
  const canCheckIn = useCan(PERMISSIONS.OPD_CHECKIN);

  const [rows, setRows] = useState<SelfCheckinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [dismissing, setDismissing] = useState<SelfCheckinRequest | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listArrivals("pending"));
      setError(null);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Could not load the arrivals board.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirm(row: SelfCheckinRequest) {
    setBusy(true);
    try {
      await api.confirmArrival(row.id, row.version);
      await load();
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Could not check the patient in.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function dismiss() {
    if (!dismissing || !reason.trim()) return;
    setBusy(true);
    try {
      await api.dismissArrival(dismissing.id, dismissing.version, reason.trim());
      setDismissing(null);
      setReason("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  const columns: Array<Column<SelfCheckinRequest>> = [
    {
      key: "patient",
      header: "Who",
      hideable: false,
      accessor: (r) => r.patientName ?? r.claimedPhone,
      cell: (r) =>
        r.patientId ? (
          <Link href={`/patients/${r.patientId}`} className="text-brand hover:underline">
            {r.patientName} <span className="font-mono text-xs text-fg-muted">{r.patientUhid}</span>
          </Link>
        ) : (
          // Not matched: show what they typed, and be clear that is all we know about them.
          <div className="flex flex-col">
            <span className="text-fg">Not matched</span>
            <span className="font-mono text-xs text-fg-muted">{r.claimedPhone}</span>
          </div>
        ),
    },
    {
      key: "appointment",
      header: "Appointment",
      filterable: true,
      accessor: (r) => valueLabel(r.providerName, "unassigned"),
      cell: (r) =>
        r.appointmentId ? (
          <div className="flex flex-col">
            <span className="text-fg">{r.providerName}</span>
            <span className="text-xs text-fg-muted">
              {r.scheduledAt && formatTime(r.scheduledAt)}
              {r.departmentName && ` · ${r.departmentName}`}
            </span>
          </div>
        ) : (
          <span className="text-fg-subtle">No appointment found today</span>
        ),
    },
    {
      key: "since",
      header: "Arrived",
      accessor: (r) => r.announcedAt,
      cell: (r) => <span className="whitespace-nowrap text-fg-muted">{formatTime(r.announcedAt)}</span>,
    },
    {
      key: "state",
      header: "State",
      accessor: (r) => (r.alreadyCheckedIn ? "Already checked in" : r.patientId ? "Ready" : "Needs a human"),
      cell: (r) =>
        r.alreadyCheckedIn ? (
          <Badge tone="neutral">Already checked in</Badge>
        ) : r.patientId ? (
          <Badge tone="success">Ready to check in</Badge>
        ) : (
          <Badge tone="warning">Needs a human</Badge>
        ),
    },
    actionsColumn<SelfCheckinRequest>((r) => (
      <TableActions label={`Actions for ${r.patientName ?? r.claimedPhone}`}>
        <TableAction
          label="Check in"
          icon={<Check size={16} strokeWidth={2} aria-hidden />}
          // Only a matched arrival that has not already been checked in by hand.
          permitted={canCheckIn && Boolean(r.patientId) && !r.alreadyCheckedIn}
          loading={busy}
          onSelect={() => void confirm(r)}
        />
        <TableAction
          label="Dismiss"
          icon={<X size={16} strokeWidth={2} aria-hidden />}
          permitted={canCheckIn}
          onSelect={() => {
            setDismissing(r);
            setReason(r.alreadyCheckedIn ? "Already checked in at the desk" : "");
          }}
        />
      </TableActions>
    )),
  ];

  return (
    <>
      <PageHeader
        title="Arrivals"
        description="Patients who have told us they are here. Confirming one checks them in."
      />

      {rows.some((r) => !r.patientId) && (
        <Alert tone="neutral">
          An arrival marked <strong className="font-medium text-fg">Needs a human</strong> could not be matched to
          an appointment today — the number may be different from the one on their record, or they may have no
          appointment. Find them, then check them in from the{" "}
          <Link href="/opd/check-in" className="text-brand hover:underline">
            check-in screen
          </Link>{" "}
          where you can search.
        </Alert>
      )}

      {!loading && rows.length === 0 ? (
        <Card>
          <EmptyState
            title="Nobody has checked themselves in"
            description="Patients appear here when they scan the check-in code in the entrance. Turn it on under Hospital configuration → Self check-in."
          />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          error={error}
          emptyMessage="Nobody is waiting."
        />
      )}

      <Dialog
        open={dismissing !== null}
        onClose={() => setDismissing(null)}
        title="Clear this arrival"
        description="It stays on record — an arrival that vanished with no note is a mystery later."
        busy={busy}
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setDismissing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" loading={busy} onClick={() => void dismiss()} disabled={!reason.trim()}>
              Clear it
            </Button>
          </>
        }
      >
        <Textarea
          label="Why?"
          value={reason}
          rows={3}
          required
          maxLength={300}
          autoFocus
          onChange={(e) => setReason(e.target.value)}
          placeholder="Nobody came to the counter, checked in by hand, wrong hospital…"
        />
      </Dialog>
    </>
  );
}

export default function ArrivalsPage() {
  return (
    <RequirePermission perm={PERMISSIONS.OPD_VIEW}>
      <ArrivalsBoard />
    </RequirePermission>
  );
}
