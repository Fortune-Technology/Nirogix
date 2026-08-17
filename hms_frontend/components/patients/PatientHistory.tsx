"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Card, Skeleton } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { EncounterSummary, InvoiceListItem, LabOrder, Visit } from "@hms/types";
import { formatDate, formatDateTime } from "@hms/utils";
import * as api from "../../lib/api";
import { useCan } from "../../lib/auth";
import { formatPaise } from "../../lib/money";

const VISIT_TONE: Record<string, "success" | "warning" | "brand" | "neutral"> = {
  completed: "success",
  in_consultation: "brand",
  checked_in: "warning",
  cancelled: "neutral",
};

function useHistory<T>(enabled: boolean, fetcher: () => Promise<T[]>): { rows: T[] | null } {
  const [rows, setRows] = useState<T[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetcher()
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  return { rows };
}

/**
 * The patient's story across time — visits, signed consultations, bills and lab reports —
 * so the same chart carries every future visit (multi-visit history, not a one-shot demo).
 * Every block is permission-gated AND the API re-checks; an unpermitted block simply
 * does not render (frontend visibility is never security).
 */
export function PatientHistory({ patientId }: { patientId: string }) {
  const canOpd = useCan(PERMISSIONS.OPD_VIEW);
  const canEmr = useCan(PERMISSIONS.EMR_VIEW);
  const canBilling = useCan(PERMISSIONS.BILLING_VIEW);
  const canLab = useCan(PERMISSIONS.LAB_ORDER_VIEW);

  const visits = useHistory<Visit>(canOpd, () => api.listVisits({ patientId }));
  const encounters = useHistory<EncounterSummary>(canEmr, () => api.listPatientEncounters(patientId));
  const invoices = useHistory<InvoiceListItem>(canBilling, () =>
    api.listInvoices({ patientId, pageSize: 50 }).then((r) => r.data),
  );
  const labOrders = useHistory<LabOrder>(canLab, () => api.listLabOrders(undefined, patientId));

  if (!canOpd && !canEmr && !canBilling && !canLab) return null;

  return (
    <section className="mt-6 flex flex-col gap-5">
      <h2 className="text-base font-semibold text-fg">History</h2>
      <div className="grid gap-5 lg:grid-cols-2">
        {canOpd && (
          <Card header={`Visits${visits.rows ? ` (${visits.rows.length})` : ""}`}>
            {!visits.rows ? (
              <Skeleton className="h-16 w-full" />
            ) : visits.rows.length === 0 ? (
              <p className="text-sm text-fg-muted">No visits yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border text-sm">
                {visits.rows.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <Link href={`/opd/${v.id}`} className="font-mono font-medium text-brand hover:underline">
                        {v.visitNumber}
                      </Link>
                      <span className="ml-2 text-fg-muted">{formatDate(v.visitDate)}</span>
                      {v.providerName && <span className="ml-2 truncate text-fg-muted">{v.providerName}</span>}
                    </div>
                    <Badge tone={VISIT_TONE[v.status] ?? "neutral"}>{v.status.replace("_", " ")}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {canEmr && (
          <Card header={`Consultations${encounters.rows ? ` (${encounters.rows.length})` : ""}`}>
            {!encounters.rows ? (
              <Skeleton className="h-16 w-full" />
            ) : encounters.rows.length === 0 ? (
              <p className="text-sm text-fg-muted">No signed consultations yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border text-sm">
                {encounters.rows.map((e) => (
                  <li key={e.id} className="py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/opd/${e.visitId}`} className="font-mono font-medium text-brand hover:underline">
                          {e.visitNumber}
                        </Link>
                        <span className="ml-2 text-fg-muted">{e.signedAt ? formatDateTime(e.signedAt) : formatDate(e.visitDate)}</span>
                      </div>
                      <span className="shrink-0 text-xs text-fg-muted">
                        {e.prescriptionCount} rx · {e.labOrderCount} lab
                      </span>
                    </div>
                    {(e.chiefComplaint || e.diagnoses.length > 0) && (
                      <p className="mt-1 truncate text-fg-muted">
                        {e.chiefComplaint}
                        {e.chiefComplaint && e.diagnoses.length > 0 && " · "}
                        {e.diagnoses
                          .map((d) => `${d.icd10Code} ${d.icd10Term}${d.isPrimary ? " (primary)" : ""}`)
                          .join(", ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {canBilling && (
          <Card header={`Invoices${invoices.rows ? ` (${invoices.rows.length})` : ""}`}>
            {!invoices.rows ? (
              <Skeleton className="h-16 w-full" />
            ) : invoices.rows.length === 0 ? (
              <p className="text-sm text-fg-muted">No invoices yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border text-sm">
                {invoices.rows.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <Link href={`/billing/${inv.id}`} className="font-mono font-medium text-brand hover:underline">
                        {inv.invoiceNumber}
                      </Link>
                      <span className="ml-2 text-fg-muted">{formatDate(inv.createdAt)}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-medium text-fg">{formatPaise(inv.totalPaise)}</span>
                      <Badge tone={inv.status === "paid" ? "success" : inv.status === "partially_paid" ? "warning" : "neutral"}>
                        {inv.status.replace("_", " ")}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {canLab && (
          <Card header={`Lab orders${labOrders.rows ? ` (${labOrders.rows.length})` : ""}`}>
            {!labOrders.rows ? (
              <Skeleton className="h-16 w-full" />
            ) : labOrders.rows.length === 0 ? (
              <p className="text-sm text-fg-muted">No lab orders yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border text-sm">
                {labOrders.rows.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <span className="font-medium text-fg">{o.testName}</span>
                      <span className="ml-2 text-fg-muted">{formatDate(o.createdAt)}</span>
                      {o.result && (
                        <span className="ml-2 text-fg-muted">
                          {o.result.value}
                          {o.result.unit ? ` ${o.result.unit}` : ""}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {o.result && o.result.flag !== "normal" && <Badge tone="danger">{o.result.flag}</Badge>}
                      <Badge tone={o.status === "resulted" ? "success" : o.status === "collected" ? "brand" : "neutral"}>
                        {o.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </section>
  );
}
