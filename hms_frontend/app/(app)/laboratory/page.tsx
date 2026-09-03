'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FlaskConical, FileText, Paperclip } from 'lucide-react';
import { Alert, Badge, Button, Card, Field, Select, Spinner } from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
import type { EnterResultRequest, LabOrder, LabTest } from '@hms/types';
import * as api from '../../../lib/api';
import { RequirePermission } from '../../../components/Can';
import { PageHeader } from '../../../components/PageHeader';
import { useCan } from '../../../lib/auth';

function firstWord(s: string): string {
  return s.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

export function flagTone(f: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (f === 'normal') return 'success';
  if (f === 'critical') return 'danger';
  if (f === 'high' || f === 'low') return 'warning';
  return 'neutral';
}

function statusTone(s: string): 'neutral' | 'warning' | 'brand' | 'success' | 'danger' {
  if (s === 'ordered') return 'warning';
  if (s === 'collected') return 'brand';
  if (s === 'resulted' || s === 'verified') return 'success';
  if (s === 'cancelled') return 'danger';
  return 'neutral';
}

function ResultForm({
  order,
  tests,
  onDone,
  onError,
}: {
  order: LabOrder;
  tests: LabTest[];
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const matched = tests.find((t) => firstWord(t.name) === firstWord(order.testName)) ?? tests[0];
  const [testId, setTestId] = useState(matched?.id ?? '');
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!value.trim()) return onError('Enter a result value.');
    setBusy(true);
    try {
      const body: EnterResultRequest = {
        testId: testId || null,
        value: value.trim(),
        notes: notes || null,
      };
      if (file) {
        const { id } = await api.uploadFile(file, 'lab-reports');
        body.fileId = id;
      }
      await api.enterLabResult(order.id, body);
      onDone();
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      {/* The test master is a large searchable list (ADR-029). The reference range keeps its en
          dash — that one IS typography, not a missing value (ADR-123). */}
      <Select
        label="Test (price + range)"
        className="min-w-[13rem]"
        value={testId}
        onChange={setTestId}
        options={tests.map((t) => ({
          value: t.id,
          label: t.name,
          description:
            t.refLow || t.refHigh ? `Reference ${t.refLow ?? ''}–${t.refHigh ?? ''}` : undefined,
        }))}
        placeholder="Not in master"
        emptyMessage="No tests in the master."
        clearable
      />
      <Field label="Value" value={value} onChange={(e) => setValue(e.target.value)} />
      <Field label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="hms-field">
        <span className="hms-label">Attach report (optional)</span>
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
            <Paperclip size={14} /> {file ? 'Change file' : 'Choose file'}
          </Button>
          {file && (
            <span className="max-w-[12rem] truncate text-xs text-fg-muted">{file.name}</span>
          )}
        </div>
      </div>
      <Button onClick={submit} loading={busy}>
        Enter result
      </Button>
    </div>
  );
}

function Worklist() {
  const [rows, setRows] = useState<LabOrder[]>([]);
  const [tests, setTests] = useState<LabTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = useCan(PERMISSIONS.LAB_MANAGE);
  const canResult = useCan(PERMISSIONS.LAB_RESULT_ENTER);
  const canVerify = useCan(PERMISSIONS.LAB_RESULT_VERIFY);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orders, ts] = await Promise.all([api.listLabOrders(), api.listLabTests()]);
      setRows(orders);
      setTests(ts);
      setError(null);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : 'Failed to load the lab worklist.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function collect(id: string) {
    setBusy(true);
    try {
      await api.collectLabSample(id);
      await load();
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : 'Could not collect the sample.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(id: string) {
    setBusy(true);
    try {
      await api.verifyLabResult(id);
      await load();
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : 'Could not verify the report.');
    } finally {
      setBusy(false);
    }
  }

  async function openAttachment(id: string) {
    try {
      const url = await api.getLabReportAttachment(id);
      if (url) window.open(url, '_blank');
    } catch {
      /* reported by the shared API-feedback layer */
    }
  }

  return (
    <>
      <PageHeader
        title="Laboratory"
        description="Tests ordered from consultations: collect, result, report."
        actions={
          <Link href="/laboratory/tests">
            <Button variant="secondary">
              <FlaskConical size={16} strokeWidth={2} /> Test master
            </Button>
          </Link>
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}

      {loading ? (
        <div className="flex items-center gap-2 text-fg-muted">
          <Spinner /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-sm text-fg-muted">
            No lab orders. They arrive from signed consultations.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((o) => (
            <Card key={o.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-fg">{o.testName}</span>
                    <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                    {o.priority === 'urgent' && <Badge tone="danger">urgent</Badge>}
                  </div>
                  <div className="mt-1 text-xs text-fg-subtle">
                    {o.patientName} · <span className="font-mono">{o.patientUhid}</span>
                  </div>
                  {o.result && (
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <span className="text-fg">
                        {o.result.value} {o.result.unit}
                      </span>
                      <Badge tone={flagTone(o.result.flag)}>{o.result.flag}</Badge>
                      {(o.result.refLow || o.result.refHigh) && (
                        <span className="text-xs text-fg-muted">
                          ref {o.result.refLow ?? ''}–{o.result.refHigh ?? ''}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {o.status === 'ordered' && canManage && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => collect(o.id)}
                    >
                      Collect sample
                    </Button>
                  )}
                  {o.status === 'resulted' && canVerify && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => verify(o.id)}
                    >
                      Verify report
                    </Button>
                  )}
                  {o.result?.hasAttachment && (
                    <Button variant="ghost" size="sm" onClick={() => openAttachment(o.id)}>
                      <Paperclip size={15} /> Attachment
                    </Button>
                  )}
                  {(o.status === 'resulted' || o.status === 'verified') && (
                    <Link href={`/laboratory/${o.id}`}>
                      <Button variant="secondary" size="sm">
                        <FileText size={15} /> Report
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
              {o.status === 'collected' && canResult && (
                <div className="mt-3 border-t border-border pt-3">
                  <ResultForm
                    order={o}
                    tests={tests}
                    onDone={() => {
                      setError(null);
                      void load();
                    }}
                    onError={setError}
                  />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

export default function LaboratoryPage() {
  return (
    <RequirePermission perm={PERMISSIONS.LAB_ORDER_VIEW}>
      <Worklist />
    </RequirePermission>
  );
}
