'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Paperclip } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  emptyLabel,
  Field,
  Select,
  Skeleton,
  Textarea,
} from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
import { DOCUMENT_TYPES, type DocumentType, type PatientDocument } from '@hms/types';
import { formatDateTime } from '@hms/utils';
import * as api from '../../lib/api';
import { useCan } from '../../lib/auth';

/**
 * A patient's documents (ADR-119) — referral letters, prior reports, insurance, identity.
 *
 * Attaching is two steps under the hood and one step to the user: the bytes go through the ordinary
 * file store, then the attachment records what the file is *about*. The user picks a file and a
 * type; everything else is inferred.
 *
 * Archived documents are hidden by default but never deleted. A document attached to the wrong
 * chart is corrected by archiving it with a reason, because the fact that it was once attached — and
 * who attached it — is itself part of the record.
 */

const TYPE_LABEL: Record<string, string> = {
  referral_letter: 'Referral letter',
  prior_report: 'Prior report',
  insurance: 'Insurance',
  id_proof: 'Identity',
  consent_form: 'Consent form',
  other: 'Other',
};

const TYPE_OPTIONS = DOCUMENT_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] ?? t }));

function humanSize(bytes: number): string {
  if (bytes <= 0) return emptyLabel('notAvailable');
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface PatientDocumentsCardProps {
  patientId: string;
  /** Attach straight onto an episode where one is in view (the chart, a case screen). */
  caseId?: string | null;
  /** Compact layout for the check-in side rail. */
  dense?: boolean;
}

export function PatientDocumentsCard({ patientId, caseId, dense }: PatientDocumentsCardProps) {
  const canView = useCan(PERMISSIONS.FILE_VIEW);
  const canUpload = useCan(PERMISSIONS.FILE_UPLOAD);

  const [docs, setDocs] = useState<PatientDocument[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<DocumentType>('referral_letter');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const [archiving, setArchiving] = useState<PatientDocument | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      setDocs(await api.listPatientDocuments(patientId, { includeArchived: showArchived }));
      setError(null);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : 'Could not load documents.');
      setDocs([]);
    }
  }, [patientId, showArchived]);

  useEffect(() => {
    if (!canView) return;
    void load();
  }, [canView, load]);

  if (!canView) return null;

  async function attach() {
    if (!pending) return;
    setSaving(true);
    try {
      await api.attachPatientDocument(patientId, pending, {
        title: title.trim() || undefined,
        documentType: type,
        note: note.trim() || undefined,
        caseId: caseId ?? undefined,
      });
      setPending(null);
      setTitle('');
      setNote('');
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : 'Could not attach the document.');
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!archiving || !reason.trim()) return;
    setSaving(true);
    try {
      await api.archivePatientDocument(patientId, archiving.id, archiving.version, reason.trim());
      setArchiving(null);
      setReason('');
      await load();
    } finally {
      setSaving(false);
    }
  }

  /** Opens the file in a new tab through the short-lived signed URL the API mints. */
  async function open(doc: PatientDocument) {
    try {
      const url = await api.getFileDownloadUrl(doc.fileId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('That file could not be opened.');
    }
  }

  return (
    <>
      <Card
        header={`Documents${docs ? ` (${docs.filter((d) => d.status === 'active').length})` : ''}`}
      >
        {error && <Alert tone="danger">{error}</Alert>}

        {!docs ? (
          <Skeleton className="h-16 w-full" />
        ) : docs.length === 0 ? (
          <p className="text-sm text-fg-muted">
            Nothing attached yet. Referral letters, prior reports and insurance documents go here.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {docs.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <button
                    type="button"
                    className="truncate text-left font-medium text-brand hover:underline"
                    onClick={() => void open(d)}
                  >
                    {d.title}
                  </button>
                  <p className="text-xs text-fg-muted">
                    {TYPE_LABEL[d.documentType] ?? d.documentType} · {humanSize(d.size)}
                    {d.caseNumber && ` · ${d.caseNumber}`}
                    {!dense && ` · ${formatDateTime(d.createdAt)}`}
                    {d.uploadedByName && !dense && ` · ${d.uploadedByName}`}
                  </p>
                  {d.note && <p className="mt-0.5 text-xs text-fg-subtle">{d.note}</p>}
                  {d.status === 'archived' && d.archiveReason && (
                    <p className="mt-0.5 text-xs text-fg-subtle">Archived: {d.archiveReason}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {d.status === 'archived' && <Badge tone="neutral">Archived</Badge>}
                  {canUpload && d.status === 'active' && (
                    <Button size="sm" variant="ghost" type="button" onClick={() => setArchiving(d)}>
                      Archive
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>
        </div>

        {canUpload && (
          <div className="mt-4 border-t border-border pt-4">
            <input
              ref={fileRef}
              type="file"
              className="hms-input text-sm"
              aria-label="Choose a document to attach"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setPending(f);
                // The filename is a better default title than nothing, and the user can change it.
                if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ''));
              }}
            />
            {pending && (
              <div className="mt-3 flex flex-col gap-3">
                <Select
                  label="What is it?"
                  value={type}
                  onChange={(v) => setType(v as DocumentType)}
                  options={TYPE_OPTIONS}
                  searchable={false}
                />
                <Field
                  label="Title"
                  value={title}
                  maxLength={200}
                  onChange={(e) => setTitle(e.target.value)}
                />
                {!dense && (
                  <Textarea
                    label="Note"
                    value={note}
                    rows={2}
                    maxLength={500}
                    onChange={(e) => setNote(e.target.value)}
                    hint="Optional — what the next person opening this should know."
                  />
                )}
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" loading={saving} onClick={() => void attach()}>
                    <Paperclip size={16} strokeWidth={2} /> Attach
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={saving}
                    onClick={() => {
                      setPending(null);
                      setTitle('');
                      if (fileRef.current) fileRef.current.value = '';
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <Dialog
        open={archiving !== null}
        onClose={() => setArchiving(null)}
        title="Archive this document"
        description="The file itself is kept. Archiving records that it should no longer be treated as part of this chart."
        busy={saving}
        footer={
          <>
            <Button
              variant="ghost"
              type="button"
              onClick={() => setArchiving(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              loading={saving}
              onClick={() => void archive()}
              disabled={!reason.trim()}
            >
              Archive
            </Button>
          </>
        }
      >
        <Textarea
          label="Why?"
          value={reason}
          rows={3}
          required
          autoFocus
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Attached to the wrong patient, superseded by a newer report…"
        />
      </Dialog>
    </>
  );
}
