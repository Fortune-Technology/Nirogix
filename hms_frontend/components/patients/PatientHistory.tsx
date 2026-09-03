'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Card, Skeleton } from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
import type { EncounterSummary, InvoiceListItem, LabOrder, PatientCase, Visit } from '@hms/types';
import { formatDate, formatDateTime } from '@hms/utils';
import * as api from '../../lib/api';
import { useCan } from '../../lib/auth';
import { PatientDocumentsCard } from './PatientDocumentsCard';
import { ConsentStatusCard } from './ConsentStatusCard';
import { formatPaise } from '../../lib/money';

const VISIT_TONE: Record<string, 'success' | 'warning' | 'brand' | 'neutral'> = {
  completed: 'success',
  in_consultation: 'brand',
  checked_in: 'warning',
  cancelled: 'neutral',
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

export interface PatientHistoryProps {
  patientId: string;
  /**
   * `grid` is the chart, two columns wide. `rail` is the check-in side panel: one column,
   * scrollable, and short lists rather than complete ones — the desk wants context at a glance,
   * not the whole record.
   */
  layout?: 'grid' | 'rail';
  /** Heading, or none where the surrounding panel already provides one. */
  heading?: string | null;
}

/**
 * The patient's story across time — cases, visits, signed consultations, bills, lab reports and
 * documents — so the same chart carries every future visit.
 *
 * **Every block is permission-gated, and the API re-checks.** That matters more here than almost
 * anywhere else in the product: this component renders for a receptionist at the check-in desk and
 * for a doctor in the consultation, and they must not see the same thing. Reception sees cases,
 * visits, bills and documents; the **Consultations** block, which carries diagnoses and chief
 * complaints, requires `emr.encounter.view` and simply does not render without it. An unpermitted
 * block is absent rather than empty — and the absence is not the boundary, the API is.
 *
 * Only this hospital's own records. Records held by *other* hospitals are ABDM territory, need the
 * patient's consent, and are requested by a named clinician from the chart (ADR-092) — not pulled
 * into a desk-side panel.
 */
export function PatientHistory({
  patientId,
  layout = 'grid',
  heading = 'History',
}: PatientHistoryProps) {
  const canOpd = useCan(PERMISSIONS.OPD_VIEW);
  const canEmr = useCan(PERMISSIONS.EMR_VIEW);
  const canBilling = useCan(PERMISSIONS.BILLING_VIEW);
  const canLab = useCan(PERMISSIONS.LAB_ORDER_VIEW);
  const canCases = useCan(PERMISSIONS.CASE_VIEW);
  const canFiles = useCan(PERMISSIONS.FILE_VIEW);

  const rail = layout === 'rail';
  // The rail is a glance, not an archive: the newest few, with the chart a click away.
  const cap = <T,>(rows: T[] | null): T[] | null => (rows && rail ? rows.slice(0, 4) : rows);

  const visits = useHistory<Visit>(canOpd, () => api.listVisits({ patientId }));
  const cases = useHistory<PatientCase>(canCases, () => api.listCases({ patientId }));
  const encounters = useHistory<EncounterSummary>(canEmr, () =>
    api.listPatientEncounters(patientId),
  );
  const invoices = useHistory<InvoiceListItem>(canBilling, () =>
    api.listInvoices({ patientId, pageSize: 50 }).then((r) => r.data),
  );
  const labOrders = useHistory<LabOrder>(canLab, () => api.listLabOrders(undefined, patientId));

  if (!canOpd && !canEmr && !canBilling && !canLab && !canCases && !canFiles) return null;

  return (
    <section className={rail ? 'flex flex-col gap-4' : 'mt-6 flex flex-col gap-5'}>
      {heading && <h2 className="text-base font-semibold text-fg">{heading}</h2>}
      {/* `[&>*]:min-w-0`: a grid item's default `min-width: auto` refuses to shrink below its
          content, so one long visit line pushed these cards past the viewport and scrolled the
          whole page sideways on a phone. */}
      <div className={rail ? 'flex flex-col gap-4' : 'grid gap-5 [&>*]:min-w-0 lg:grid-cols-2'}>
        {/* Rail only. The patient chart has `CasesCard`, which manages cases rather than just
            listing them — two cases blocks on one page would be duplication, not richness. */}
        {canCases && rail && (
          <Card header={`Treatment cases${cases.rows ? ` (${cases.rows.length})` : ''}`}>
            {!cases.rows ? (
              <Skeleton className="h-16 w-full" />
            ) : cases.rows.length === 0 ? (
              <p className="text-sm text-fg-muted">No treatment cases.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border text-sm">
                {cap(cases.rows)!.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <span className="text-fg">{c.title}</span>
                      <p className="text-xs text-fg-muted">
                        <span className="font-mono">{c.caseNumber}</span>
                        {c.visitCount > 0 &&
                          ` · ${c.visitCount} visit${c.visitCount === 1 ? '' : 's'}`}
                        {c.providerName && ` · ${c.providerName}`}
                      </p>
                    </div>
                    <Badge tone={c.status === 'open' ? 'brand' : 'neutral'}>{c.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {canOpd && (
          <Card header={`Visits${visits.rows ? ` (${visits.rows.length})` : ''}`}>
            {!visits.rows ? (
              <Skeleton className="h-16 w-full" />
            ) : visits.rows.length === 0 ? (
              <p className="text-sm text-fg-muted">No visits yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border text-sm">
                {cap(visits.rows)!.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <Link
                        href={`/opd/${v.id}`}
                        className="font-mono font-medium text-brand hover:underline"
                      >
                        {v.visitNumber}
                      </Link>
                      <span className="ml-2 text-fg-muted">{formatDate(v.visitDate)}</span>
                      {v.providerName && (
                        <span className="ml-2 truncate text-fg-muted">{v.providerName}</span>
                      )}
                    </div>
                    <Badge tone={VISIT_TONE[v.status] ?? 'neutral'}>
                      {v.status.replace('_', ' ')}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {canEmr && (
          <Card header={`Consultations${encounters.rows ? ` (${encounters.rows.length})` : ''}`}>
            {!encounters.rows ? (
              <Skeleton className="h-16 w-full" />
            ) : encounters.rows.length === 0 ? (
              <p className="text-sm text-fg-muted">No signed consultations yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border text-sm">
                {cap(encounters.rows)!.map((e) => (
                  <li key={e.id} className="py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/opd/${e.visitId}`}
                          className="font-mono font-medium text-brand hover:underline"
                        >
                          {e.visitNumber}
                        </Link>
                        <span className="ml-2 text-fg-muted">
                          {e.signedAt ? formatDateTime(e.signedAt) : formatDate(e.visitDate)}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs text-fg-muted">
                        {e.prescriptionCount} rx · {e.labOrderCount} lab
                      </span>
                    </div>
                    {(e.chiefComplaint || e.diagnoses.length > 0) && (
                      <p className="mt-1 truncate text-fg-muted">
                        {e.chiefComplaint}
                        {e.chiefComplaint && e.diagnoses.length > 0 && ' · '}
                        {e.diagnoses
                          .map(
                            (d) =>
                              `${d.icd10Code} ${d.icd10Term}${d.isPrimary ? ' (primary)' : ''}`,
                          )
                          .join(', ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {canBilling && (
          <Card header={`Invoices${invoices.rows ? ` (${invoices.rows.length})` : ''}`}>
            {!invoices.rows ? (
              <Skeleton className="h-16 w-full" />
            ) : invoices.rows.length === 0 ? (
              <p className="text-sm text-fg-muted">No invoices yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border text-sm">
                {cap(invoices.rows)!.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <Link
                        href={`/billing/${inv.id}`}
                        className="font-mono font-medium text-brand hover:underline"
                      >
                        {inv.invoiceNumber}
                      </Link>
                      <span className="ml-2 text-fg-muted">{formatDate(inv.createdAt)}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-medium text-fg">{formatPaise(inv.totalPaise)}</span>
                      <Badge
                        tone={
                          inv.status === 'paid'
                            ? 'success'
                            : inv.status === 'partially_paid'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {inv.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {canLab && (
          <Card header={`Lab orders${labOrders.rows ? ` (${labOrders.rows.length})` : ''}`}>
            {!labOrders.rows ? (
              <Skeleton className="h-16 w-full" />
            ) : labOrders.rows.length === 0 ? (
              <p className="text-sm text-fg-muted">No lab orders yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border text-sm">
                {cap(labOrders.rows)!.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <span className="font-medium text-fg">{o.testName}</span>
                      <span className="ml-2 text-fg-muted">{formatDate(o.createdAt)}</span>
                      {o.result && (
                        <span className="ml-2 text-fg-muted">
                          {o.result.value}
                          {o.result.unit ? ` ${o.result.unit}` : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {o.result && o.result.flag !== 'normal' && (
                        <Badge tone="danger">{o.result.flag}</Badge>
                      )}
                      <Badge
                        tone={
                          o.status === 'resulted'
                            ? 'success'
                            : o.status === 'collected'
                              ? 'brand'
                              : 'neutral'
                        }
                      >
                        {o.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {/* Rail only, and status only (ADR-120). The chart has `ExternalHistoryCard`, which shows
            the records themselves to whoever may read them; this says whether anything is
            outstanding, which is what a desk can act on. */}
        {rail && <ConsentStatusCard patientId={patientId} />}

        {/* Documents are their own component because they are the one block that WRITES — a file
            handed over at the counter is attached here (ADR-119). */}
        <PatientDocumentsCard patientId={patientId} dense={rail} />
      </div>
    </section>
  );
}
