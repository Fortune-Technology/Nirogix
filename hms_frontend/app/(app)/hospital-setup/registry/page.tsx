'use client';

import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { Alert, Badge, Button, Card, DateDisplay, EmptyState, Spinner, toast } from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
import { Building2, Download, IdCard, Search, Upload } from 'lucide-react';
import * as api from '../../../../lib/api';
import { RequirePermission } from '../../../../components/Can';
import { useCan } from '../../../../lib/auth';
import { downloadCsv } from '../../../../lib/csv';

/**
 * The national registries — HFR and HPR (ADR-096…ADR-098).
 *
 * Milestone 4 is the one part of ABDM that moves no patient data: it lists the hospital and its
 * clinicians in two government registries. So this screen is not about consent or encryption — it is
 * about **not misleading an administrator through a process that takes weeks and that we do not
 * control**. Three things follow:
 *
 * - **Submitted is never shown as done.** HFR routes every registration to a human verifier. A green
 *   tick here would have somebody believe they hold a Facility ID they do not, and find out when
 *   ABDM's service registration fails a month later.
 * - **Bulk is honest about being a portal process.** There is no bulk API — both published specs
 *   were searched. What this screen does is spare the re-keying at one end and the eyeball-matching
 *   at the other; the upload itself happens on ABDM's site, and the page says so.
 * - **An import that could not match a row says which row.** Silence would be worse than a nuisance:
 *   an HPR id attached to the wrong clinician is one real person's national identity on another
 *   person's record.
 */

const FACILITY_STATUS: Record<
  string,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }
> = {
  draft: { label: 'Not submitted', tone: 'neutral' },
  submitted: { label: 'Awaiting verification', tone: 'warning' },
  under_review: { label: 'Under review', tone: 'warning' },
  verified: { label: 'Verified', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

const HPR_STATUS: Record<
  string,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }
> = {
  not_started: { label: 'Not started', tone: 'neutral' },
  aadhaar_verified: { label: 'Aadhaar verified', tone: 'warning' },
  mobile_verified: { label: 'Mobile verified', tone: 'warning' },
  registered: { label: 'Registered', tone: 'success' },
  already_registered: { label: 'Already had an HPR ID', tone: 'success' },
};

export default function RegistryPage() {
  return (
    <RequirePermission perm={PERMISSIONS.ABDM_REGISTRY_VIEW}>
      <Registry />
    </RequirePermission>
  );
}

function Registry() {
  const canManage = useCan(PERMISSIONS.ABDM_REGISTRY_MANAGE);
  const [facilities, setFacilities] = useState<api.AbdmFacilityRegistration[]>([]);
  const [enrolments, setEnrolments] = useState<api.AbdmHprEnrolment[]>([]);
  const [loading, setLoading] = useState(true);
  const [outcome, setOutcome] = useState<(api.AbdmImportOutcome & { kind: string }) | null>(null);

  const load = useCallback(async () => {
    const [f, e] = await Promise.all([
      api.listAbdmFacilityRegistrations().catch(() => []),
      api.listAbdmHprEnrolments().catch(() => []),
    ]);
    setFacilities(f);
    setEnrolments(e);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportRoster(kind: 'professionals' | 'facilities') {
    try {
      const data = await api.exportAbdmBulk(kind);
      if (data.rows.length === 0) {
        toast.info(
          kind === 'professionals'
            ? 'Every active staff member already holds an HPR ID.'
            : 'Every facility already has a Facility ID.',
        );
        return;
      }
      downloadCsv(
        `abdm-${kind}.csv`,
        data.columns,
        data.rows.map((row) => data.columns.map((c) => row[c] ?? '')),
      );
    } catch {
      /* the shared client raised the backend's own message */
    }
  }

  async function importResults(kind: 'professionals' | 'facilities', file: File) {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      toast.error('That file has no data rows.');
      return;
    }
    try {
      const result = await api.importAbdmBulk(kind, rows);
      setOutcome({ ...result, kind });
      // Deliberately not "Saved." — how many matched, and how many need a person, is the news.
      toast.success(
        `${result.matched} matched. ${result.unmatched.length + result.ambiguous.length} need attention.`,
      );
      await load();
    } catch {
      /* handled by the shared client */
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert>
        These are India&rsquo;s national registries for hospitals and clinicians. Nothing here
        shares a patient&rsquo;s health record &mdash; it lists this hospital and its staff so that
        ABDM knows who we are.
      </Alert>

      {/* --- Facilities ------------------------------------------------------------------- */}
      <Card
        header={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Building2 className="size-4 text-fg-muted" aria-hidden />
              Health Facility Registry
            </span>
            <span className="flex flex-wrap gap-2">
              {/* Search is offered to anyone who can see this screen, and before registration in
                  reading order: one building holding two Facility IDs is the failure that costs
                  weeks, and it is only preventable beforehand. */}
              <Link href="/hospital-setup/registry/facility/search">
                <Button variant="ghost">
                  <Search className="size-4" aria-hidden />
                  Search HFR
                </Button>
              </Link>
              {canManage && (
                <Link href="/hospital-setup/registry/facility">
                  <Button variant="secondary">
                    {facilities.length === 0 ? 'Register this hospital' : 'Open registration form'}
                  </Button>
                </Link>
              )}
            </span>
          </div>
        }
      >
        {facilities.length === 0 ? (
          <EmptyState
            title="This hospital is not registered yet"
            description="Registering lists the facility nationally and issues the Facility ID that the rest of ABDM identifies you by."
          />
        ) : (
          <ul className="space-y-2">
            {facilities.map((f) => {
              const status = FACILITY_STATUS[f.status] ?? {
                label: f.status,
                tone: 'neutral' as const,
              };
              return (
                <li key={f.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-fg">{f.facilityName}</span>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">
                    {f.facilityId ? (
                      <>Facility ID {f.facilityId}</>
                    ) : f.submittedAt ? (
                      <>
                        Submitted <DateDisplay value={f.submittedAt} /> &mdash; a verifier at ABDM
                        still has to approve it. No Facility ID is issued until they do.
                      </>
                    ) : (
                      <>Saved but not submitted.</>
                    )}
                  </p>
                  {f.statusMessage && <p className="mt-1 text-xs text-danger">{f.statusMessage}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* --- Professionals --------------------------------------------------------------- */}
      <Card
        header={
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <IdCard className="size-4 text-fg-muted" aria-hidden />
              Healthcare Professional Registry
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">
                {enrolments.filter((e) => e.hprId).length} of {enrolments.length} have an HPR ID
              </Badge>
              {canManage && (
                <Link href="/hospital-setup/registry/professional">
                  <Button variant="secondary">Enrol a clinician</Button>
                </Link>
              )}
            </span>
          </div>
        }
      >
        {enrolments.length === 0 ? (
          <EmptyState
            title="No staff enrolled yet"
            description="Each doctor, nurse and pharmacist gets their own HPR ID. Most clinicians already have one — enrolment checks before creating another."
          />
        ) : (
          <ul className="space-y-2">
            {enrolments.map((e) => {
              const status = HPR_STATUS[e.status] ?? { label: e.status, tone: 'neutral' as const };
              return (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <span className="text-sm text-fg">
                    {e.hprId ?? 'No HPR ID yet'}
                    {e.registrationCouncil && (
                      <span className="text-fg-muted"> &middot; {e.registrationCouncil}</span>
                    )}
                  </span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* --- Bulk ------------------------------------------------------------------------ */}
      {canManage && (
        <Card header="Onboarding many at once">
          <p className="text-sm text-fg-muted">
            ABDM has no bulk API &mdash; the upload happens on their own portal. Download the list
            here so nobody re-types it, upload it at ABDM, then bring their results file back so the
            issued IDs land against the right records instead of being matched by eye.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void exportRoster('professionals')}>
              <Download className="size-4" aria-hidden />
              Export staff
            </Button>
            <Button variant="secondary" onClick={() => void exportRoster('facilities')}>
              <Download className="size-4" aria-hidden />
              Export facilities
            </Button>
            <ImportButton
              label="Import staff results"
              onFile={(f) => void importResults('professionals', f)}
            />
            <ImportButton
              label="Import facility results"
              onFile={(f) => void importResults('facilities', f)}
            />
          </div>

          {outcome && (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-fg">
                <strong>{outcome.matched}</strong> row{outcome.matched === 1 ? '' : 's'} matched and
                updated.
              </p>

              {outcome.ambiguous.length > 0 && (
                <Alert tone="danger">
                  <p className="font-medium">
                    {outcome.ambiguous.length} row{outcome.ambiguous.length === 1 ? '' : 's'}{' '}
                    matched more than one person and{' '}
                    {outcome.ambiguous.length === 1 ? 'was' : 'were'} skipped.
                  </p>
                  {/* Named rather than counted: guessing would put one person's national ID on
                      another person's record, so a human has to decide. */}
                  <ul className="mt-1 text-sm">
                    {outcome.ambiguous.map((a) => (
                      <li key={a.row}>
                        Row {a.row}: &ldquo;{a.identifier}&rdquo; matches {a.candidates} staff
                        members. Add a registration number to tell them apart.
                      </li>
                    ))}
                  </ul>
                </Alert>
              )}

              {outcome.unmatched.length > 0 && (
                <Alert>
                  <p className="font-medium">
                    {outcome.unmatched.length} row{outcome.unmatched.length === 1 ? '' : 's'} could
                    not be matched.
                  </p>
                  <ul className="mt-1 text-sm">
                    {outcome.unmatched.slice(0, 10).map((u) => (
                      <li key={u.row}>
                        Row {u.row}: &ldquo;{u.identifier}&rdquo; &mdash; {u.reason}.
                      </li>
                    ))}
                    {outcome.unmatched.length > 10 && (
                      <li>&hellip; and {outcome.unmatched.length - 10} more.</li>
                    )}
                  </ul>
                </Alert>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

/** A file picker that looks like the other buttons. */
function ImportButton({ label, onFile }: { label: string; onFile: (file: File) => void }) {
  function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    // Reset, so choosing the same corrected file twice still fires.
    e.target.value = '';
  }
  return (
    <label className="hms-button hms-button--secondary cursor-pointer">
      <Upload className="size-4" aria-hidden />
      {label}
      <input type="file" accept=".csv,text/csv" className="sr-only" onChange={pick} />
    </label>
  );
}

/**
 * Parses ABDM's results file.
 *
 * Handles quoted cells and embedded commas, which a naive `split(",")` would corrupt silently —
 * a hospital name containing a comma would shift every later column and make the import match the
 * wrong person. Anything more exotic than RFC 4180 belongs to a library, and there is no library
 * here for a reason: this runs on one file an administrator chose.
 */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!header) return [];
  // The BOM Excel writes would otherwise become part of the first column's name.
  const columns = header.map((h) => h.replace(/^﻿/, '').trim());
  return body.map((r) => Object.fromEntries(columns.map((c, i) => [c, (r[i] ?? '').trim()])));
}
