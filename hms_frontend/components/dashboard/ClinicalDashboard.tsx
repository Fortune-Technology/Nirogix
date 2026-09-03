'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  FlaskConical,
  Package,
  Pill,
  Stethoscope,
  UserPlus,
} from 'lucide-react';
import { BarChart, Button, Card, StatCard, type Series } from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
import type {
  Appointment,
  DashboardOverview,
  LabOrder,
  PendingPrescription,
  Visit,
} from '@hms/types';
import { formatTime } from '@hms/utils';
import * as api from '../../lib/api';
import {
  DashboardRow,
  DashboardShell,
  KpiGrid,
  PanelEmpty,
  PanelRow,
  firstName,
} from './DashboardShell';

/**
 * The clinical role dashboards (ADR-044) — doctor, receptionist, pharmacist, lab
 * technician — as **one component configured per role**, not four near-identical
 * pages. They share the shell, the KPI row and the panel rhythm with the hospital
 * admin and platform dashboards, so a hospital's screens read as one product.
 *
 * What varies is the day's work each role owns; what does not vary is where to
 * look for it. Every panel is loaded from an endpoint that already exists and is
 * permission-gated on the server — a user without the permission simply gets no
 * panel, because the fetch is never made.
 */

export type ClinicalRole = 'doctor' | 'receptionist' | 'pharmacist' | 'lab';

const BRAND = 'var(--hms-brand)';
const INFO = 'var(--hms-info)';
const CLINIC_HOURS = Array.from({ length: 14 }, (_, i) => i + 7);

const ROLE_COPY: Record<ClinicalRole, { title: string; context: string }> = {
  doctor: { title: 'Your clinic today', context: 'Consultations, in token order' },
  receptionist: { title: 'Front desk', context: "Today's bookings and the waiting queue" },
  pharmacist: { title: 'Pharmacy', context: 'Prescriptions waiting to be dispensed, and stock' },
  lab: { title: 'Laboratory', context: 'The order-to-result worklist' },
};

export function ClinicalDashboard({ role, fullName }: { role: ClinicalRole; fullName?: string }) {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [prescriptions, setPrescriptions] = useState<PendingPrescription[]>([]);
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // Each role loads only what its own panels show — no speculative fetching.
      const [o, v, a, p, l] = await Promise.all([
        api.getDashboardOverview(7).catch(() => null),
        role === 'doctor' || role === 'receptionist'
          ? api.listVisits({}).catch(() => [])
          : Promise.resolve([]),
        role === 'receptionist'
          ? api
              .listAppointments({ page: 1, pageSize: 8, status: 'booked' })
              .then((r) => r.data)
              .catch(() => [])
          : Promise.resolve([]),
        role === 'pharmacist'
          ? api.listPendingPrescriptions().catch(() => [])
          : Promise.resolve([]),
        role === 'lab' ? api.listLabOrders().catch(() => []) : Promise.resolve([]),
      ]);
      setOverview(o);
      setVisits(v);
      setAppointments(a);
      setPrescriptions(p);
      setLabOrders(l);
      setError(null);
    } catch {
      setError('Could not load your dashboard.');
    }
  }, [role]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = overview?.today_counts;
  const waiting = visits.filter((v) => v.status === 'checked_in');
  const inConsult = visits.filter((v) => v.status === 'in_consultation');
  const pendingLabs = labOrders.filter((o) => o.status === 'ordered');
  const collected = labOrders.filter((o) => o.status === 'collected');

  const hourSeries: Series[] = useMemo(() => {
    const rows = CLINIC_HOURS.map((h) => overview?.loadByHour.find((p) => p.hour === h));
    return [
      {
        key: 'scheduled',
        label: 'Scheduled',
        values: rows.map((r) => r?.scheduled ?? 0),
        color: BRAND,
      },
      { key: 'walkIn', label: 'Walk-in', values: rows.map((r) => r?.walkIn ?? 0), color: INFO },
    ];
  }, [overview]);
  const hourLabels = CLINIC_HOURS.map((h) => `${String(h).padStart(2, '0')}:00`);

  if (error && !overview) return <Card>{error}</Card>;

  const copy = ROLE_COPY[role];

  return (
    <DashboardShell
      context={copy.context}
      title={`${copy.title}${firstName(fullName) ? `, ${firstName(fullName)}` : ''}`}
      actions={<PrimaryAction role={role} />}
    >
      <KpiGrid>
        {role === 'doctor' && (
          <>
            <StatCard
              label="Waiting"
              value={visits.length ? waiting.length : (counts?.checkedIn ?? null)}
              icon={<ClipboardList size={16} strokeWidth={1.75} aria-hidden />}
              hint="Checked in, not yet seen"
              href="/opd"
              linkLabel="Waiting, open the OPD queue"
            />
            <StatCard
              label="In consultation"
              value={visits.length ? inConsult.length : (counts?.inConsultation ?? null)}
              icon={<Stethoscope size={16} strokeWidth={1.75} aria-hidden />}
              href="/opd"
              linkLabel="In consultation, open the OPD queue"
            />
            <StatCard
              label="Completed today"
              value={counts?.completed ?? null}
              icon={<CalendarDays size={16} strokeWidth={1.75} aria-hidden />}
            />
            <StatCard
              label="Lab results pending"
              value={overview?.pendingLabOrders ?? null}
              icon={<FlaskConical size={16} strokeWidth={1.75} aria-hidden />}
              hint="Ordered or collected, not resulted"
              href="/laboratory"
              linkLabel="Lab results pending, open the laboratory worklist"
            />
          </>
        )}
        {role === 'receptionist' && (
          <>
            <StatCard
              label="Booked today"
              value={counts?.appointments ?? null}
              icon={<CalendarDays size={16} strokeWidth={1.75} aria-hidden />}
              href="/appointments"
              linkLabel="Booked today, open appointments"
            />
            <StatCard
              label="Waiting now"
              value={visits.length ? waiting.length : (counts?.checkedIn ?? null)}
              icon={<ClipboardList size={16} strokeWidth={1.75} aria-hidden />}
              href="/opd"
              linkLabel="Waiting now, open the OPD queue"
            />
            <StatCard
              label="In consultation"
              value={visits.length ? inConsult.length : (counts?.inConsultation ?? null)}
              icon={<Stethoscope size={16} strokeWidth={1.75} aria-hidden />}
              href="/opd"
              linkLabel="In consultation, open the OPD queue"
            />
            <StatCard
              label="Registered today"
              value={counts?.newPatients ?? null}
              icon={<UserPlus size={16} strokeWidth={1.75} aria-hidden />}
              href="/patients/registrations"
              linkLabel="Registered today, open today's registrations"
            />
          </>
        )}
        {role === 'pharmacist' && (
          <>
            <StatCard
              label="Prescriptions waiting"
              value={prescriptions.length}
              icon={<Pill size={16} strokeWidth={1.75} aria-hidden />}
              hint="Signed, not yet dispensed"
              href="/pharmacy"
              linkLabel="Prescriptions waiting, open dispensing"
            />
            <StatCard
              label="Drugs at reorder level"
              value={overview?.lowStock.length ?? null}
              icon={<Package size={16} strokeWidth={1.75} aria-hidden />}
              invertDelta
              href="/pharmacy/stock"
              linkLabel="Drugs at reorder level, open stock"
            />
            <StatCard
              label="Out of stock"
              value={overview ? overview.lowStock.filter((d) => d.onHand === 0).length : null}
              icon={<Package size={16} strokeWidth={1.75} aria-hidden />}
              href="/pharmacy/stock"
              linkLabel="Out of stock, open stock"
            />
            <StatCard
              label="Seen today"
              value={counts?.completed ?? null}
              icon={<Stethoscope size={16} strokeWidth={1.75} aria-hidden />}
              hint="Consultations completed"
            />
          </>
        )}
        {role === 'lab' && (
          <>
            <StatCard
              label="Awaiting collection"
              value={pendingLabs.length}
              icon={<FlaskConical size={16} strokeWidth={1.75} aria-hidden />}
              href="/laboratory"
              linkLabel="Awaiting collection, open the laboratory worklist"
            />
            <StatCard
              label="Awaiting result"
              value={collected.length}
              icon={<FlaskConical size={16} strokeWidth={1.75} aria-hidden />}
              href="/laboratory"
              linkLabel="Awaiting result, open the laboratory worklist"
            />
            <StatCard
              label="Resulted today"
              value={labOrders.filter((o) => o.status === 'resulted').length}
              icon={<ClipboardList size={16} strokeWidth={1.75} aria-hidden />}
              href="/laboratory"
              linkLabel="Resulted today, open the laboratory worklist"
            />
            <StatCard
              label="Urgent"
              value={
                labOrders.filter((o) => o.priority === 'urgent' && o.status !== 'resulted').length
              }
              icon={<FlaskConical size={16} strokeWidth={1.75} aria-hidden />}
              invertDelta
              href="/laboratory"
              linkLabel="Urgent, open the laboratory worklist"
            />
          </>
        )}
      </KpiGrid>

      <DashboardRow split="wide">
        <Card
          header={
            role === 'lab'
              ? 'Worklist'
              : role === 'pharmacist'
                ? 'Prescriptions waiting'
                : 'The queue'
          }
        >
          {role === 'lab' ? (
            labOrders.length > 0 ? (
              <div className="flex flex-col">
                {labOrders.slice(0, 10).map((o) => (
                  <PanelRow
                    key={o.id}
                    icon={<FlaskConical size={15} strokeWidth={1.75} aria-hidden />}
                    tone={o.priority === 'urgent' ? 'danger' : 'default'}
                    title={o.testName}
                    meta={`${o.patientName} · ${o.patientUhid}`}
                    value={o.status}
                  />
                ))}
                <PanelLink href="/laboratory" label="Open the worklist" />
              </div>
            ) : (
              <PanelEmpty>No lab orders. They arrive from signed consultations.</PanelEmpty>
            )
          ) : role === 'pharmacist' ? (
            prescriptions.length > 0 ? (
              <div className="flex flex-col">
                {prescriptions.slice(0, 10).map((p) => (
                  <PanelRow
                    key={p.id}
                    icon={<Pill size={15} strokeWidth={1.75} aria-hidden />}
                    title={p.drugName}
                    meta={`${p.patientName} · ${p.patientUhid}`}
                    value={p.dose ?? undefined}
                  />
                ))}
                <PanelLink href="/pharmacy" label="Open dispensing" />
              </div>
            ) : (
              <PanelEmpty>Nothing waiting to be dispensed.</PanelEmpty>
            )
          ) : visits.length > 0 ? (
            <div className="flex flex-col">
              {visits.slice(0, 10).map((v) => (
                <PanelRow
                  key={v.id}
                  icon={<span className="font-mono text-xs">#{v.tokenNumber}</span>}
                  title={v.patientName}
                  meta={`${v.providerName ?? 'Unassigned'} · checked in ${formatTime(v.checkedInAt)}`}
                  value={v.status.replace('_', ' ')}
                />
              ))}
              <PanelLink href="/opd" label="Open the OPD queue" />
            </div>
          ) : (
            <PanelEmpty>Nobody in the queue right now.</PanelEmpty>
          )}
        </Card>

        <Card header="Today's arrivals">
          <p className="mb-3 text-sm text-fg-muted">
            Check-ins by hour, scheduled against walk-in.
          </p>
          <BarChart
            series={hourSeries}
            labels={hourLabels}
            height={180}
            ariaLabel="Check-ins by hour of day"
            emptyMessage="Nobody has checked in yet today."
          />
        </Card>
      </DashboardRow>

      {(role === 'receptionist' || role === 'pharmacist') && (
        <DashboardRow split="even">
          {role === 'receptionist' ? (
            <Card header="Next appointments">
              {appointments.length > 0 ? (
                <div className="flex flex-col">
                  {appointments.map((a) => (
                    <PanelRow
                      key={a.id}
                      icon={<CalendarDays size={15} strokeWidth={1.75} aria-hidden />}
                      title={a.patientName}
                      meta={`${a.providerName} · ${a.patientUhid}`}
                      value={formatTime(a.scheduledAt)}
                    />
                  ))}
                  <PanelLink href="/appointments" label="Open appointments" />
                </div>
              ) : (
                <PanelEmpty>No booked appointments ahead.</PanelEmpty>
              )}
            </Card>
          ) : (
            <Card header="Low stock">
              {overview && overview.lowStock.length > 0 ? (
                <div className="flex flex-col">
                  {overview.lowStock.map((d) => (
                    <PanelRow
                      key={d.id}
                      icon={<Package size={15} strokeWidth={1.75} aria-hidden />}
                      tone={d.onHand === 0 ? 'danger' : 'warning'}
                      title={d.name}
                      meta={`Reorder level ${d.reorderLevel}`}
                      value={`${d.onHand} left`}
                    />
                  ))}
                  <PanelLink href="/pharmacy/stock" label="Open stock" />
                </div>
              ) : (
                <PanelEmpty>Every drug is above its reorder level.</PanelEmpty>
              )}
            </Card>
          )}

          <Card header="Quick actions">
            <div className="flex flex-col gap-2">
              {role === 'receptionist' ? (
                <>
                  <ActionLink
                    href="/patients/new"
                    icon={<UserPlus size={15} strokeWidth={2} aria-hidden />}
                    label="Register a patient"
                  />
                  <ActionLink
                    href="/appointments/new"
                    icon={<CalendarDays size={15} strokeWidth={2} aria-hidden />}
                    label="Book an appointment"
                  />
                  <ActionLink
                    href="/opd/check-in"
                    icon={<ClipboardList size={15} strokeWidth={2} aria-hidden />}
                    label="Check a patient in"
                  />
                </>
              ) : (
                <>
                  <ActionLink
                    href="/pharmacy"
                    icon={<Pill size={15} strokeWidth={2} aria-hidden />}
                    label="Dispense a prescription"
                  />
                  <ActionLink
                    href="/pharmacy/stock"
                    icon={<Package size={15} strokeWidth={2} aria-hidden />}
                    label="Receive stock"
                  />
                </>
              )}
            </div>
          </Card>
        </DashboardRow>
      )}
    </DashboardShell>
  );
}

function PrimaryAction({ role }: { role: ClinicalRole }) {
  if (role === 'receptionist')
    return (
      <Link href="/opd/check-in">
        <Button>
          <ClipboardList size={16} strokeWidth={2} aria-hidden /> Check in
        </Button>
      </Link>
    );
  if (role === 'pharmacist')
    return (
      <Link href="/pharmacy">
        <Button>
          <Pill size={16} strokeWidth={2} aria-hidden /> Dispense
        </Button>
      </Link>
    );
  if (role === 'lab')
    return (
      <Link href="/laboratory">
        <Button>
          <FlaskConical size={16} strokeWidth={2} aria-hidden /> Worklist
        </Button>
      </Link>
    );
  return (
    <Link href="/opd">
      <Button>
        <Stethoscope size={16} strokeWidth={2} aria-hidden /> Open the queue
      </Button>
    </Link>
  );
}

function PanelLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
    >
      {label} <ArrowRight size={15} strokeWidth={2} aria-hidden />
    </Link>
  );
}

function ActionLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-token border border-border bg-surface px-3 py-2.5 text-sm text-fg transition-colors hover:border-brand hover:bg-surface-2"
    >
      <span className="text-brand">{icon}</span>
      {label}
    </Link>
  );
}

/**
 * Which dashboard a signed-in user gets. Permission-derived, not role-name-derived:
 * a hospital can rename its roles, but what someone is allowed to do is the truth
 * (ADR-044). Order matters — the first match wins, so a pharmacist who can also
 * check patients in still lands on the pharmacy view.
 */
export function clinicalRoleFor(can: (perm: string) => boolean): ClinicalRole | null {
  if (can(PERMISSIONS.EMR_WRITE)) return 'doctor';
  if (can(PERMISSIONS.PHARMACY_DISPENSE)) return 'pharmacist';
  if (can(PERMISSIONS.LAB_RESULT_ENTER) || can(PERMISSIONS.LAB_MANAGE)) return 'lab';
  if (can(PERMISSIONS.OPD_CHECKIN) || can(PERMISSIONS.APPOINTMENT_CREATE)) return 'receptionist';
  return null;
}
