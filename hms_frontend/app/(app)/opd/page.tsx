'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Stethoscope, UserCheck } from 'lucide-react';
import {
  actionsColumn,
  Badge,
  Button,
  DataTable,
  EmptyValue,
  Select,
  TableAction,
  TableActions,
  type Column,
  valueLabel,
  ValueOrEmpty,
  ViewAction,
} from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
import type { Visit } from '@hms/types';
import { formatTime } from '@hms/utils';
import * as api from '../../../lib/api';
import { RequirePermission, Can } from '../../../components/Can';
import { PageHeader } from '../../../components/PageHeader';
import { useCan } from '../../../lib/auth';
import { formatPaise } from '../../../lib/money';

function statusTone(s: string): 'success' | 'warning' | 'neutral' | 'danger' | 'brand' {
  if (s === 'checked_in') return 'warning';
  if (s === 'in_consultation') return 'brand';
  if (s === 'completed') return 'success';
  if (s === 'cancelled') return 'danger';
  return 'neutral';
}

function invoiceTone(s: string): 'success' | 'warning' | 'neutral' | 'danger' {
  if (s === 'paid') return 'success';
  if (s === 'partially_paid') return 'warning';
  if (s === 'void') return 'neutral';
  return 'danger'; // draft = unpaid
}

const STATUS_LABEL: Record<string, string> = {
  checked_in: 'Checked in',
  in_consultation: 'In consultation',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// The filter offers the same four states the Status column shows, plus "everything".
const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
];

function OpdQueue() {
  const [rows, setRows] = useState<Visit[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canUpdate = useCan(PERMISSIONS.OPD_UPDATE);
  const canConsult = useCan(PERMISSIONS.EMR_VIEW);
  const canWrite = useCan(PERMISSIONS.EMR_WRITE);
  const canCheckin = useCan(PERMISSIONS.OPD_CHECKIN);
  // A clinician (writes encounters, doesn't run the front desk) lands on their own list;
  // anyone can widen it. The scope is also enforced server-side (`mine` resolves the
  // provider linked to the login — no provider record, no personal queue).
  const [mine, setMine] = useState(canWrite && !canCheckin);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listVisits({ status: status || undefined, mine }));
      setError(null);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : 'Failed to load the queue.');
    } finally {
      setLoading(false);
    }
  }, [status, mine]);

  useEffect(() => {
    void load();
  }, [load]);

  async function advance(v: Visit, next: 'in_consultation' | 'completed') {
    setBusy(true);
    try {
      // The row's version rides along so a concurrent change 409s instead of clobbering.
      await api.updateVisitStatus(v.id, { status: next, version: v.version });
      await load();
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : 'Could not update the visit.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  const columns: Array<Column<Visit>> = [
    {
      key: 'token',
      header: 'Token',
      hideable: false,
      accessor: (v) => v.tokenNumber,
      cell: (v) => (
        <span className="font-mono text-base font-semibold text-fg">#{v.tokenNumber}</span>
      ),
    },
    {
      key: 'patient',
      header: 'Patient',
      hideable: false,
      accessor: (v) => `${v.patientName} ${v.patientUhid}`,
      cell: (v) => (
        <Link href={`/patients/${v.patientId}`} className="text-brand hover:underline">
          {v.patientName} <span className="font-mono text-xs text-fg-muted">{v.patientUhid}</span>
        </Link>
      ),
    },
    {
      key: 'case',
      header: 'Case',
      filterable: true,
      // A one-off visit belongs to no ongoing case, which is the normal state (ADR-116).
      accessor: (v) => valueLabel(v.caseTitle, 'notApplicable'),
      cell: (v) =>
        v.caseNumber ? (
          <span className="flex flex-col">
            <span className="text-fg">{v.caseTitle}</span>
            <span className="font-mono text-xs text-fg-muted">{v.caseNumber}</span>
          </span>
        ) : (
          <EmptyValue reason="notApplicable" />
        ),
    },
    {
      key: 'provider',
      header: 'Provider',
      filterable: true,
      // A walk-in is checked in before a doctor is chosen — assignable, so say so.
      accessor: (v) => valueLabel(v.providerName, 'unassigned'),
      cell: (v) => <ValueOrEmpty value={v.providerName} reason="unassigned" />,
    },
    {
      key: 'since',
      header: 'Checked in',
      accessor: (v) => v.checkedInAt,
      cell: (v) => (
        <span className="whitespace-nowrap text-fg-muted">{formatTime(v.checkedInAt)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      filterable: true,
      accessor: (v) => STATUS_LABEL[v.status] ?? v.status,
      cell: (v) => <Badge tone={statusTone(v.status)}>{STATUS_LABEL[v.status] ?? v.status}</Badge>,
    },
    {
      key: 'bill',
      header: 'Bill',
      accessor: (v) => valueLabel(v.invoice?.status.replace('_', ' '), 'notApplicable'),
      cell: (v) =>
        v.invoice ? (
          <Link
            href={`/billing/${v.invoice.id}`}
            className="inline-flex items-center gap-2 hover:underline"
          >
            <Badge tone={invoiceTone(v.invoice.status)}>{v.invoice.status.replace('_', ' ')}</Badge>
            {v.invoice.balancePaise > 0 && (
              <span className="text-xs text-fg-muted">
                {formatPaise(v.invoice.balancePaise)} due
              </span>
            )}
          </Link>
        ) : (
          // Nothing chargeable has happened on this visit yet, so there is no bill to show.
          <EmptyValue reason="notApplicable" />
        ),
    },
    actionsColumn<Visit>((v) => (
      <TableActions label={`Actions for token #${v.tokenNumber}`}>
        <ViewAction
          label={v.status === 'completed' ? 'View visit' : 'Open visit'}
          permitted={canConsult && v.status !== 'cancelled'}
          href={`/opd/${v.id}`}
        />
        <TableAction
          label="Start consult"
          icon={<Stethoscope size={16} strokeWidth={2} aria-hidden />}
          permitted={canUpdate && v.status === 'checked_in'}
          loading={busy}
          onSelect={() => void advance(v, 'in_consultation')}
        />
        <TableAction
          label="Complete visit"
          icon={<CheckCircle2 size={16} strokeWidth={2} aria-hidden />}
          permitted={canUpdate && v.status === 'in_consultation'}
          loading={busy}
          onSelect={() => void advance(v, 'completed')}
        />
      </TableActions>
    )),
  ];

  return (
    <>
      <PageHeader
        title="OPD queue"
        description="Today's checked-in patients, in token order."
        actions={
          <Can perm={PERMISSIONS.OPD_CHECKIN}>
            <Link href="/opd/check-in">
              <Button>
                <UserCheck size={16} strokeWidth={2} /> Check in
              </Button>
            </Link>
          </Can>
        }
      />
      <div className="flex flex-wrap items-end gap-4">
        <Select
          label="Status"
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
          placeholder="All"
          searchable={false}
          className="w-56"
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          My patients only
        </label>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(v) => v.id}
        loading={loading}
        error={error}
        emptyMessage={
          mine ? 'No patients assigned to you today.' : 'No patients in the queue today.'
        }
        emptyDescription={mine ? 'Untick “My patients only” to see the whole queue.' : undefined}
      />
    </>
  );
}

export default function OpdPage() {
  return (
    <RequirePermission perm={PERMISSIONS.OPD_VIEW}>
      <OpdQueue />
    </RequirePermission>
  );
}
