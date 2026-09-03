'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Alert, Badge, Card, EmptyState, ErrorState, Skeleton } from '@hms/ui';
import { DateDisplay, DateTimeDisplay } from '@hms/ui';
import type {
  Appointment,
  InvoiceListItem,
  PatientLabReport,
  PatientPortalProfile,
} from '@hms/types';
import * as api from '../../../../lib/api';

/**
 * One hospital's records for this patient (ADR-052).
 *
 * Read-only, and only what the hospital already gave them: who they are on file, their
 * appointments, their bills, and **resulted** laboratory reports. A pending sample is
 * not shown — the server does not return one, because a half-entered value read as a
 * finding is the kind of mistake a portal must not invite.
 *
 * The tenant in the URL is not trusted: every call re-checks it against an active link
 * server-side, so a patient editing the address bar reaches nothing.
 */
export default function HospitalRecordsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [profile, setProfile] = useState<PatientPortalProfile | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [reports, setReports] = useState<PatientLabReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.profile(tenantId),
      api.appointments(tenantId),
      api.invoices(tenantId),
      api.labReports(tenantId),
    ])
      .then(([p, a, i, r]) => {
        setProfile(p);
        setAppointments(a.data);
        setInvoices(i.data);
        setReports(r);
        setError(null);
      })
      .catch((e) =>
        setError(
          e instanceof api.ApiRequestError
            ? e.message
            : 'Could not load your records from this hospital.',
        ),
      )
      .finally(() => setLoading(false));
  };

  useEffect(load, [tenantId]);

  if (error)
    return <ErrorState title="Could not load these records" message={error} onRetry={load} />;
  if (loading || !profile) return <Skeleton height="20rem" />;

  return (
    <>
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
      >
        <ArrowLeft size={14} strokeWidth={2} aria-hidden /> All hospitals
      </Link>

      <Card header="Your details">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Detail label="Name" value={`${profile.firstName} ${profile.lastName ?? ''}`.trim()} />
          <Detail label="Hospital ID (UHID)" value={profile.uhid} />
          <Detail
            label="Date of birth"
            value={profile.dateOfBirth ? <DateDisplay value={profile.dateOfBirth} /> : '—'}
          />
          <Detail label="Blood group" value={profile.bloodGroup ?? '—'} />
          <Detail label="Mobile" value={profile.phone ?? '—'} />
          <Detail label="Email" value={profile.email ?? '—'} />
        </dl>
        <p className="mt-4 text-xs text-fg-subtle">
          These details are held by the hospital. To correct anything, ask them at your next visit.
        </p>
      </Card>

      <Card header="Appointments">
        {appointments.length === 0 ? (
          <EmptyState
            title="No appointments"
            description="Appointments booked for you will appear here."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {appointments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="text-sm text-fg">
                  <DateTimeDisplay value={a.scheduledAt} />
                </span>
                <span className="text-sm text-fg-muted">{a.providerName ?? '—'}</span>
                <Badge tone={a.status === 'cancelled' ? 'neutral' : 'brand'}>{a.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card header="Bills">
        {invoices.length === 0 ? (
          <EmptyState title="No bills" description="Invoices raised for you will appear here." />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="text-sm font-medium text-fg">{i.invoiceNumber}</span>
                <span className="text-sm text-fg-muted">
                  <DateDisplay value={i.createdAt} />
                </span>
                <Badge tone={i.balancePaise > 0 ? 'warning' : 'success'}>
                  {i.balancePaise > 0 ? 'Balance due' : 'Paid'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card header="Laboratory reports">
        {reports.length === 0 ? (
          <EmptyState
            title="No reports yet"
            description="A report appears here once the laboratory has finished it."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-fg">{r.testName}</span>
                  <span className="block text-xs text-fg-subtle">
                    {r.resultedAt ? <DateDisplay value={r.resultedAt} /> : null}
                  </span>
                </span>
                <span className="text-sm text-fg">
                  {r.value ?? '—'} {r.unit ?? ''}
                </span>
                {r.flag && r.flag !== 'normal' ? <Badge tone="warning">{r.flag}</Badge> : null}
              </li>
            ))}
          </ul>
        )}
        <Alert className="mt-4">
          A result outside the usual range is not a diagnosis. Talk to your doctor about what a
          report means.
        </Alert>
      </Card>
    </>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className="text-sm text-fg">{value}</dd>
    </div>
  );
}
