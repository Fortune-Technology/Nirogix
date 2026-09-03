'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarX, LogIn, Plus } from 'lucide-react';
import {
  Badge,
  Button,
  DataTable,
  TableAction,
  TableActions,
  actionsColumn,
  type Column,
  type DataTableQuery,
} from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
import type { Appointment } from '@hms/types';
import { formatDateTime } from '@hms/utils';
import * as api from '../../../lib/api';
import { RequirePermission, Can } from '../../../components/Can';
import { PageHeader } from '../../../components/PageHeader';
import { useCan } from '../../../lib/auth';

function statusTone(s: string): 'success' | 'warning' | 'neutral' | 'danger' {
  if (s === 'booked') return 'success';
  if (s === 'cancelled') return 'danger';
  if (s === 'completed') return 'neutral';
  return 'warning';
}

function AppointmentsTable() {
  // Server mode: the API owns paging and the status filter, which now flows through
  // the table's own faceted filter rather than a bespoke select (ADR-063).
  const [rows, setRows] = useState<Appointment[]>([]);
  const [query, setQuery] = useState<DataTableQuery>({
    page: 1,
    pageSize: 20,
    search: '',
    sort: [],
    filters: {},
  });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canCancel = useCan(PERMISSIONS.APPOINTMENT_CANCEL);
  const canCheckIn = useCan(PERMISSIONS.OPD_CHECKIN);

  const statusFilter = query.filters.status;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listAppointments({
        page: query.page,
        pageSize: query.pageSize,
        status: query.filters.status?.length ? query.filters.status.join(',') : undefined,
        sort: api.sortParam(query.sort),
      });
      setRows(res.data);
      setTotal(res.page.total);
      setError(null);
    } catch {
      setError('Could not load appointments.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(id: string) {
    setBusy(true);
    try {
      await api.cancelAppointment(id, 'cancelled from portal');
      await load();
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setBusy(false);
    }
  }

  const columns: Array<Column<Appointment>> = [
    {
      key: 'when',
      header: 'When',
      hideable: false,
      accessor: (a) => a.scheduledAt,
      cell: (a) => (
        <span className="whitespace-nowrap text-fg">{formatDateTime(a.scheduledAt)}</span>
      ),
    },
    {
      key: 'patient',
      header: 'Patient',
      hideable: false,
      accessor: (a) => `${a.patientName} ${a.patientUhid}`,
      cell: (a) => (
        <Link href={`/patients/${a.patientId}`} className="text-brand hover:underline">
          {a.patientName} <span className="font-mono text-xs text-fg-muted">{a.patientUhid}</span>
        </Link>
      ),
    },
    {
      key: 'provider',
      header: 'Provider',
      accessor: (a) => a.providerName,
      cell: (a) => a.providerName,
    },
    {
      key: 'dur',
      header: 'Duration',
      accessor: (a) => a.durationMinutes,
      cell: (a) => `${a.durationMinutes}m`,
    },
    {
      key: 'status',
      header: 'Status',
      filterable: true,
      filterOptions: [
        { value: 'booked' },
        { value: 'cancelled' },
        { value: 'completed' },
        { value: 'no_show', label: 'no show' },
      ],
      accessor: (a) => a.status,
      cell: (a) => <Badge tone={statusTone(a.status)}>{a.status}</Badge>,
    },
    actionsColumn<Appointment>((a) => (
      <TableActions label={`Actions for ${a.patientName}'s appointment`}>
        <TableAction
          label="Check in"
          icon={<LogIn size={16} strokeWidth={2} aria-hidden />}
          permitted={canCheckIn && a.status === 'booked'}
          href={`/opd/check-in?appointmentId=${a.id}&patientId=${a.patientId}&providerId=${a.providerId}`}
        />
        <TableAction
          label="Cancel appointment"
          icon={<CalendarX size={16} strokeWidth={2} aria-hidden />}
          tone="danger"
          permitted={canCancel && a.status === 'booked'}
          loading={busy}
          confirm={{
            title: `Cancel ${a.patientName}'s appointment?`,
            description: `${formatDateTime(a.scheduledAt)} with ${a.providerName}. The slot is released and the patient is not checked in.`,
            confirmLabel: 'Cancel appointment',
          }}
          onSelect={() => void cancel(a.id)}
        />
      </TableActions>
    )),
  ];

  return (
    <>
      <PageHeader
        title="Appointments"
        description={`${total} total`}
        actions={
          <Can perm={PERMISSIONS.APPOINTMENT_CREATE}>
            <Link href="/appointments/new">
              <Button>
                <Plus size={16} strokeWidth={2} /> Book appointment
              </Button>
            </Link>
          </Can>
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(a) => a.id}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        emptyMessage={
          statusFilter?.length ? 'No appointments with this status.' : 'No appointments.'
        }
        urlState
        server={{
          total,
          page: query.page,
          pageSize: query.pageSize,
          search: query.search,
          sort: query.sort,
          filters: query.filters,
          onChange: setQuery,
        }}
      />
    </>
  );
}

export default function AppointmentsPage() {
  return (
    <RequirePermission perm={PERMISSIONS.APPOINTMENT_VIEW}>
      <AppointmentsTable />
    </RequirePermission>
  );
}
