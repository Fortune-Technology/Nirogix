'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { Alert, Badge, Button, Dialog, Select, Spinner } from '@hms/ui';
import type {
  ImportDuplicateStrategy,
  ImportModuleSpec,
  ImportOptions,
  ImportPreview,
} from '@hms/types';
import * as api from '../../lib/api';

/**
 * The one bulk-import experience (ADR-138) — every module, one component.
 *
 * A module contributes a *description* of its data on the server; nothing about medicines, tests
 * or doctors appears below. Four steps, in the order a person actually needs them:
 *
 * 1. **Get the shape right** — download a sample CSV with the real columns and two real rows.
 * 2. **Choose the file**, and correct any column the server could not match to a field.
 * 3. **See what would happen** before it happens — ready, already-exists, and errors, per row.
 * 4. **Decide about duplicates**, then import.
 *
 * The preview describes the file, not a reservation: it is re-run at commit, so a record created
 * by somebody else in between is seen. The dialog says so rather than promising otherwise.
 */
export function BulkImportDialog({
  moduleKey,
  open,
  onClose,
  onImported,
}: {
  moduleKey: string;
  open: boolean;
  onClose: () => void;
  /** Called after a successful import so the page behind can reload. */
  onImported: () => void;
}) {
  const [spec, setSpec] = useState<ImportModuleSpec | null>(null);
  const [strategies, setStrategies] = useState<ImportOptions['duplicateStrategies']>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [strategy, setStrategy] = useState<ImportDuplicateStrategy>('skip');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    api
      .getImportOptions()
      .then((o) => {
        setSpec(o.modules.find((m) => m.key === moduleKey) ?? null);
        setStrategies(o.duplicateStrategies);
      })
      .catch(() => setSpec(null));
  }, [open, moduleKey]);

  // Reset between openings: a dialog that remembers the last file is a way to import it twice.
  useEffect(() => {
    if (open) return;
    setFile(null);
    setPreview(null);
    setMapping({});
    setStrategy('skip');
    setError(null);
  }, [open]);

  const runPreview = useCallback(
    async (chosen: File, overrides?: Record<string, string | null>) => {
      setBusy(true);
      setError(null);
      try {
        const result = await api.previewImport(moduleKey, chosen, overrides);
        setPreview(result);
        setMapping(result.mapping);
      } catch (e) {
        setPreview(null);
        setError(e instanceof api.ApiRequestError ? e.message : 'Could not read that file.');
      } finally {
        setBusy(false);
      }
    },
    [moduleKey],
  );

  async function onPick(chosen: File | undefined) {
    if (!chosen) return;
    setFile(chosen);
    await runPreview(chosen);
  }

  async function remap(column: string, field: string) {
    const next = { ...mapping, [column]: field === '' ? null : field };
    setMapping(next);
    if (file) await runPreview(file, next);
  }

  async function commit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.commitImport(moduleKey, file, strategy, mapping);
      const { created, updated, skipped, failed } = result.totals;
      const parts = [
        created ? `${created} added` : null,
        updated ? `${updated} updated` : null,
        skipped ? `${skipped} skipped` : null,
        failed ? `${failed} failed` : null,
      ].filter(Boolean);
      // The shared toast layer does not see this call (it is multipart), so the outcome is
      // announced here — and it says the counts, because "Imported." answers nothing.
      const { toast } = await import('@hms/ui');
      if (failed > 0) toast.warning(`Import finished: ${parts.join(', ')}.`);
      else toast.success(`Import finished: ${parts.join(', ') || 'nothing to do'}.`);
      onImported();
      onClose();
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : 'Could not import that file.');
    } finally {
      setBusy(false);
    }
  }

  const canCommit =
    preview !== null &&
    preview.missingRequired.length === 0 &&
    preview.totals.rows > preview.totals.errors;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={spec ? `Import ${spec.label.toLowerCase()}` : 'Import'}
      description={spec?.description}
      size="lg"
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void commit()} loading={busy} disabled={!canCommit}>
            {preview ? `Import ${preview.totals.rows - preview.totals.errors} rows` : 'Import'}
          </Button>
        </>
      }
    >
      {!spec ? (
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <Spinner /> Loading…
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* 1 — the shape. Offered before the file picker, because a person who downloads this
              first never reaches the mapping step at all. */}
          <section>
            <h3 className="hms-label">1. Start from the sample file</h3>
            <p className="mt-1 text-sm text-fg-muted">
              The right columns, in the right order, with two example rows. Required columns are
              marked <span className="font-mono">*</span>. Keep the header row.
            </p>
            <div className="mt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  void api.downloadImportTemplate(moduleKey, `${moduleKey}-template.csv`)
                }
              >
                <Download size={15} /> Download sample CSV
              </Button>
            </div>
          </section>

          <section>
            <h3 className="hms-label">2. Choose your file</h3>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => void onPick(e.target.files?.[0])}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                <Upload size={15} /> {file ? 'Choose a different file' : 'Choose CSV file'}
              </Button>
              {file && <span className="text-sm text-fg-muted">{file.name}</span>}
            </div>
          </section>

          {error && <Alert tone="danger">{error}</Alert>}

          {preview && (
            <>
              {/* 3 — mapping. Shown always, not only on failure: a person needs to be able to
                  see that "MRP" went to "Selling price" before trusting the import. */}
              <section>
                <h3 className="hms-label">3. Check the columns</h3>
                <p className="mt-1 text-sm text-fg-muted">
                  Matched from your headers. Change any that went to the wrong field — hospitals
                  export from different systems, and the names rarely agree.
                </p>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-fg-muted">
                        <th className="py-1 pr-4 font-medium">Your column</th>
                        <th className="py-1 font-medium">Goes to</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.columns.map((col) => (
                        <tr key={col} className="border-t border-border">
                          <td className="py-1.5 pr-4 align-middle font-mono text-xs">{col}</td>
                          <td className="py-1.5 align-middle">
                            <Select
                              aria-label={`Field for column ${col}`}
                              className="max-w-[18rem]"
                              value={mapping[col] ?? ''}
                              onChange={(v) => void remap(col, v)}
                              options={spec.fields.map((f) => ({
                                value: f.key,
                                label: f.required ? `${f.label} *` : f.label,
                                description: f.hint,
                              }))}
                              placeholder="Ignore this column"
                              clearable
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.missingRequired.length > 0 && (
                  <div className="mt-3">
                    <Alert tone="danger">
                      Nothing can be imported until a column is mapped to:{' '}
                      {preview.missingRequired.map((f) => f.label).join(', ')}.
                    </Alert>
                  </div>
                )}
              </section>

              {/* 4 — what would happen. Counts first, then only the rows that need a decision. */}
              <section>
                <h3 className="hms-label">4. What will happen</h3>
                <div className="mt-2 flex flex-wrap gap-2 text-sm">
                  <Badge tone="neutral">{preview.totals.rows} rows in your file</Badge>
                  <Badge tone="success">{preview.totals.ready} ready to import</Badge>
                  {preview.totals.duplicates > 0 && (
                    <Badge tone="warning">{preview.totals.duplicates} already exist</Badge>
                  )}
                  {preview.totals.errors > 0 && (
                    <Badge tone="danger">{preview.totals.errors} with errors</Badge>
                  )}
                </div>

                {preview.totals.duplicates > 0 && (
                  <div className="mt-3 max-w-md">
                    <Select
                      label={`Rows whose ${spec.duplicateKey.label.toLowerCase()} already exists`}
                      value={strategy}
                      onChange={(v) => setStrategy((v || 'skip') as ImportDuplicateStrategy)}
                      options={strategies
                        // A module that must not be updated in bulk does not offer the option.
                        .filter((s) => s.value !== 'update' || spec.supportsUpdate)
                        .map((s) => ({
                          value: s.value,
                          label: s.label,
                          description: s.description,
                        }))}
                    />
                  </div>
                )}

                {/* Only the rows a person has to do something about. A table of 500 correct rows
                    is not a preview, it is the file they already have. */}
                {preview.rows.some((r) => r.status !== 'ready') && (
                  <div className="mt-3 max-h-64 overflow-y-auto rounded-token border border-border">
                    <table className="w-full text-sm">
                      <tbody>
                        {preview.rows
                          .filter((r) => r.status !== 'ready')
                          .map((r) => (
                            <tr key={r.line} className="border-b border-border last:border-0">
                              <td className="w-16 py-1.5 pl-3 align-top text-xs text-fg-muted">
                                Row {r.line}
                              </td>
                              <td className="py-1.5 pr-3 align-top">
                                {r.status === 'duplicate' ? (
                                  <span className="text-fg-muted">
                                    <Badge tone="warning">Exists</Badge> {spec.duplicateKey.label}{' '}
                                    <span className="font-mono text-xs">{r.keyValue}</span>
                                    {r.matched ? ` — ${r.matched.label}` : ''}
                                  </span>
                                ) : (
                                  <span className="text-danger">
                                    {r.errors.map((e) => e.message).join('; ')}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <p className="mt-3 text-xs text-fg-subtle">
                  Rows with errors are skipped; everything else is imported, so one bad cell does
                  not cost you the file. This preview describes your file as it is now — it is
                  checked again when you import.
                </p>
              </section>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}

/**
 * The button that opens it, with the dialog wired up. A page adds one line, and the import
 * behaves identically everywhere — which is the whole point of not writing this six times.
 */
export function BulkImportAction({
  moduleKey,
  onImported,
}: {
  moduleKey: string;
  onImported: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Upload size={16} strokeWidth={2} /> Import
      </Button>
      <BulkImportDialog
        moduleKey={moduleKey}
        open={open}
        onClose={() => setOpen(false)}
        onImported={onImported}
      />
    </>
  );
}
