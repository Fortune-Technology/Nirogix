'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity } from 'lucide-react';
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
  ValueOrEmpty,
} from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
import { formatTime } from '@hms/utils';
import type { HospitalWorkflowConfig, VitalsQueueEntry } from '@hms/types';
import * as api from '../../../../lib/api';
import { RequirePermission } from '../../../../components/Can';
import { PageHeader } from '../../../../components/PageHeader';
import { useCan } from '../../../../lib/auth';
import {
  EMPTY_VITALS,
  VitalsFields,
  hasAnyReading,
  summariseVitals,
  toVitalsPayload,
  type VitalsDraft,
} from '../../../../components/vitals/VitalsFields';

/**
 * The vitals queue (ADR-113) — the "vitals after check-in" workflow.
 *
 * Patients arrive here the moment they are checked in and leave it when a consultation starts. The
 * list is derived from the visits themselves rather than stored, so it cannot drift out of step
 * with the OPD board.
 *
 * A visit whose readings are already taken stays on the list, marked done, because the nurse needs
 * to see what they have finished and be able to re-take a reading they doubt.
 */

function VitalsQueue() {
  const canRecord = useCan(PERMISSIONS.VITALS_RECORD);

  const [rows, setRows] = useState<VitalsQueueEntry[]>([]);
  const [workflow, setWorkflow] = useState<HospitalWorkflowConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [active, setActive] = useState<VitalsQueueEntry | null>(null);
  const [draft, setDraft] = useState<VitalsDraft>(EMPTY_VITALS);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [queue, config] = await Promise.all([api.listVitalsQueue(), api.getWorkflowConfig()]);
      setRows(queue);
      setWorkflow(config);
      setError(null);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : 'Could not load the vitals queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function open(entry: VitalsQueueEntry) {
    setActive(entry);
    // Deliberately blank, even when a reading exists: this is a NEW observation, and pre-filling it
    // with the last one invites a nurse to save numbers they did not take.
    setDraft(EMPTY_VITALS);
    setNotes('');
    setSaveError(null);
  }

  async function save() {
    if (!active) return;
    if (!hasAnyReading(draft)) {
      setSaveError('Enter at least one reading.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await api.recordVitals({
        visitId: active.visitId,
        stage: 'pre_consultation',
        ...toVitalsPayload(draft),
        notes: notes.trim() || undefined,
      });
      setActive(null);
      await load();
    } catch (err) {
      setSaveError(
        err instanceof api.ApiRequestError ? err.message : 'Could not record the vitals.',
      );
    } finally {
      setSaving(false);
    }
  }

  const columns: Array<Column<VitalsQueueEntry>> = [
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
      key: 'provider',
      header: 'Seeing',
      filterable: true,
      accessor: (v) => valueLabel(v.providerName, 'unassigned'),
      cell: (v) => <ValueOrEmpty value={v.providerName} reason="unassigned" />,
    },
    {
      key: 'department',
      header: 'Department',
      filterable: true,
      accessor: (v) => valueLabel(v.department, 'unassigned'),
      cell: (v) => <ValueOrEmpty value={v.department} reason="unassigned" />,
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
      key: 'vitals',
      header: 'Vitals',
      filterable: true,
      accessor: (v) => (v.latestVitals ? 'Recorded' : 'Waiting'),
      cell: (v) =>
        v.latestVitals ? (
          <div className="flex flex-col gap-1">
            <Badge tone="success">Recorded</Badge>
            <span className="text-xs text-fg-muted">{summariseVitals(v.latestVitals)}</span>
            {v.latestVitals.recordedByName && (
              <span className="text-xs text-fg-subtle">
                {v.latestVitals.recordedByName} · {formatTime(v.latestVitals.recordedAt)}
              </span>
            )}
          </div>
        ) : (
          <Badge tone="warning">Waiting</Badge>
        ),
    },
    actionsColumn<VitalsQueueEntry>((v) => (
      <TableActions label={`Actions for token #${v.tokenNumber}`}>
        <TableAction
          label={v.latestVitals ? 'Record again' : 'Record vitals'}
          icon={<Activity size={16} strokeWidth={2} aria-hidden />}
          permitted={canRecord}
          onSelect={() => open(v)}
        />
      </TableActions>
    )),
  ];

  // A hospital that has not chosen this workflow gets an explanation rather than an empty table it
  // has to interpret.
  if (!loading && workflow && workflow.vitalsMode !== 'after_checkin') {
    return (
      <>
        <PageHeader
          title="Vitals queue"
          description="Patients checked in and waiting for their vitals."
        />
        <Card>
          <EmptyState
            title="This hospital does not use a separate vitals step"
            description={
              workflow.vitalsMode === 'during_checkin'
                ? 'Vitals are recorded at the front desk during check-in.'
                : workflow.vitalsMode === 'disabled'
                  ? 'Vitals are switched off for this hospital.'
                  : 'Vitals are recorded by the doctor during the consultation.'
            }
            action={
              <Link href="/hospital-setup/workflow">
                <Button variant="secondary">Change this in Hospital configuration</Button>
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Vitals queue"
        description="Patients checked in and waiting for their vitals, in token order."
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(v) => v.visitId}
        loading={loading}
        error={error}
        emptyMessage="Nobody is waiting for vitals."
        emptyDescription="Patients appear here as soon as the front desk checks them in."
      />

      <Dialog
        open={active !== null}
        onClose={() => setActive(null)}
        title={active ? `Vitals — ${active.patientName}` : 'Vitals'}
        description={active ? `Token #${active.tokenNumber} · ${active.patientUhid}` : undefined}
        busy={saving}
        size="lg"
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setActive(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" loading={saving} onClick={() => void save()}>
              Save vitals
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {saveError && <Alert tone="danger">{saveError}</Alert>}
          {active?.latestVitals && (
            <Alert tone="neutral">
              A reading was already taken
              {active.latestVitals.recordedByName
                ? ` by ${active.latestVitals.recordedByName}`
                : ''}{' '}
              at {formatTime(active.latestVitals.recordedAt)}:{' '}
              {summariseVitals(active.latestVitals)}. Saving records a new one; the earlier reading
              is kept.
            </Alert>
          )}
          <VitalsFields
            value={draft}
            onChange={setDraft}
            required={workflow?.vitalsRequiredParams ?? []}
            optional={workflow?.vitalsOptionalParams ?? []}
            disabled={saving}
          />
          <Textarea
            label="Notes"
            value={notes}
            rows={2}
            maxLength={500}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything the doctor should know about how the reading was taken…"
            hint="Optional — for example that the patient had just climbed stairs."
          />
        </div>
      </Dialog>
    </>
  );
}

export default function VitalsQueuePage() {
  return (
    <RequirePermission perm={PERMISSIONS.VITALS_VIEW}>
      <VitalsQueue />
    </RequirePermission>
  );
}
