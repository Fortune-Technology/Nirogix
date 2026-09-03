'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Card, DataTable, DateField, StatCard, type Column } from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
import type { AuditEntry } from '@hms/types';
import { formatDate, formatDateTime } from '@hms/utils';
import * as api from '../../../lib/api';
import { RequirePermission } from '../../../components/Can';
import { PageHeader } from '../../../components/PageHeader';

/**
 * The platform's end-of-day report (requirement #2). The only thing the platform
 * records at a daily grain is its own audit trail, so this is an honest summary of a
 * single day's platform activity — event volume, anything warning-or-worse, and
 * support sessions — over the day's audit entries, with the entries themselves
 * below. Aggregate platform figures (hospitals, revenue) are deliberately absent:
 * they have no per-day source (ADR-023, ADR-043). Gated by `audit.view`, the same
 * permission as Security & audit.
 */
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function statusTone(code: number | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (code === null) return 'neutral';
  if (code >= 500) return 'danger';
  if (code >= 400) return 'warning';
  return 'success';
}

const columns: Array<Column<AuditEntry>> = [
  {
    key: 'createdAt',
    header: 'When',
    hideable: false,
    accessor: (r) => r.createdAt,
    cell: (r) => (
      <span className="whitespace-nowrap text-fg-muted">{formatDateTime(r.createdAt)}</span>
    ),
  },
  {
    key: 'action',
    header: 'Action',
    accessor: (r) => r.action,
    cell: (r) => <span className="font-medium text-fg">{r.action}</span>,
  },
  {
    key: 'resource',
    header: 'Resource',
    accessor: (r) => r.resourceType,
    cell: (r) => r.resourceType ?? '—',
  },
  {
    key: 'severity',
    header: 'Severity',
    filterable: true,
    filterOptions: [
      { value: 'info' },
      { value: 'notice' },
      { value: 'warning' },
      { value: 'critical' },
    ],
    accessor: (r) => r.severity,
    cell: (r) => <span className="text-fg-muted">{r.severity}</span>,
  },
  {
    key: 'statusCode',
    header: 'Status',
    accessor: (r) => r.statusCode,
    cell: (r) =>
      r.statusCode === null ? '—' : <Badge tone={statusTone(r.statusCode)}>{r.statusCode}</Badge>,
  },
];

function Eod() {
  const today = useMemo(() => iso(new Date()), []);
  const [day, setDay] = useState(today);
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      // A day's platform audit is small; load it in one page so the tiles below are
      // exact for a normal day. `total` still reports the true count if it exceeds this.
      const res = await api.listAudit({
        from: date,
        to: date,
        pageSize: 100,
        sortBy: 'createdAt',
        sortDir: 'desc',
      });
      setRows(res.data);
      setTotal(res.page.total);
    } catch {
      setError('Could not load the end-of-day report.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(day);
  }, [day, load]);

  const severe = rows.filter((r) => r.severity === 'warning' || r.severity === 'critical').length;
  const supportSessions = rows.filter((r) => (r.path ?? '').includes('support-session')).length;
  const truncated = total > rows.length;

  return (
    <>
      <PageHeader
        title="End-of-day report"
        description={`A single day of platform activity, from the audit trail, ${formatDate(day)}.`}
        actions={
          <DateField
            label="Day"
            value={day || null}
            max={today}
            onChange={(v) => setDay(v ?? today)}
          />
        }
      />

      {error ? <Card>{error}</Card> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Events"
          value={loading ? null : total}
          hint={truncated ? `latest ${rows.length} shown below` : undefined}
        />
        <StatCard
          label="Warning or critical"
          value={loading ? null : severe}
          hint="Needs a look"
          invertDelta
        />
        <StatCard
          label="Support sessions"
          value={loading ? null : supportSessions}
          hint="Operators entering a hospital"
        />
      </div>

      <Card header={`Activity: ${formatDate(day)}`}>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          searchPlaceholder="Search action, path, or resource…"
          emptyMessage="No platform activity on this day."
        />
      </Card>
    </>
  );
}

export default function EodPage() {
  return (
    <RequirePermission perm={PERMISSIONS.AUDIT_VIEW}>
      <Eod />
    </RequirePermission>
  );
}
