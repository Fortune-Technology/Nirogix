'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, ConfirmDialog, Spinner } from '@hms/ui';
import { formatDateTime } from '@hms/utils';
import type { MySignature } from '@hms/types';
import * as api from '../../lib/api';

/**
 * A person's own signature (ADR-137) — upload, preview, replace, remove.
 *
 * Three things this card is careful about, because each one is a way the feature could mislead:
 *
 * - **It says what it is.** An uploaded image rendered onto documents, not a legally certified
 *   cryptographic signature. Written on the card, not only in a doc nobody opens.
 * - **Replacing does not rewrite the past.** The copy says so at the moment of replacing, where
 *   somebody is deciding, rather than leaving them to assume either way.
 * - **"Remove" means "stop signing new documents".** It does not, and cannot, take the signature
 *   off a prescription printed last month — so the dialog says that instead of implying a purge.
 *
 * Rendered for any role holding `platform.signature.manage`; the API acts on the authenticated
 * user and takes no user id, so this card can only ever be about the person looking at it.
 */
export function ProfileSignatureCard() {
  const [state, setState] = useState<MySignature | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    api
      .getMySignature()
      .then((s) => {
        setState(s);
        setError(null);
      })
      .catch(() => setState(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await api.uploadMySignature(file);
      load();
    } catch (e) {
      // Type and size are refused by the server; showing its own words beats guessing (ADR-057).
      setError(e instanceof api.ApiRequestError ? e.message : 'Could not upload that signature.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.removeMySignature();
      setConfirmRemove(false);
      load();
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setBusy(false);
    }
  }

  const active = state?.active ?? null;
  const superseded = (state?.versions ?? []).filter((v) => v.id !== active?.id);

  return (
    <Card
      header="Signature"
      footer={
        <>
          <span className="text-xs text-fg-muted">PNG, JPEG or WebP · up to 512 KB</span>
          <span className="hms-card__footer-spacer" />
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => void onPick(e.target.files?.[0])}
          />
          {active && !busy ? (
            <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(true)}>
              Remove
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            loading={busy}
            onClick={() => fileRef.current?.click()}
          >
            {active ? 'Replace signature' : 'Upload signature'}
          </Button>
        </>
      }
    >
      {/* The honesty line, on the card rather than in a document nobody opens (ADR-137). */}
      <p className="text-sm text-fg-muted">
        Your signature is added to documents you sign — prescriptions and consultation summaries for
        a doctor, verified reports for a laboratory user. It is an{' '}
        <span className="font-medium text-fg">image of your signature</span>, not a certified
        cryptographic digital signature.
      </p>

      {error && (
        <div className="mt-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-fg-muted">
          <Spinner /> Loading your signature…
        </div>
      ) : active ? (
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="rounded-token border border-border bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.imageUrl ?? ''}
              alt="Your signature"
              className="max-h-20 max-w-[16rem] object-contain"
            />
          </div>
          <div className="text-sm">
            <div className="flex items-center gap-2">
              <Badge tone="success">In use</Badge>
              <span className="text-fg-muted">Version {active.version}</span>
            </div>
            <p className="mt-1 text-fg-muted">Added {formatDateTime(active.createdAt)}</p>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-fg-subtle">
          No signature yet. Documents you sign print a blank signature line until you add one.
        </p>
      )}

      {/* Earlier versions are listed, not hidden: they are what past documents still show, and a
          person deciding whether to replace theirs should be able to see that history exists. */}
      {superseded.length > 0 && (
        <div className="mt-5">
          <p className="hms-label">Earlier versions</p>
          <ul className="mt-1 flex flex-col divide-y divide-border text-sm">
            {superseded.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2 py-2">
                <Badge tone="neutral">{v.status === 'removed' ? 'Withdrawn' : 'Replaced'}</Badge>
                <span className="text-fg-muted">Version {v.version}</span>
                <span className="ml-auto text-xs text-fg-muted">
                  {formatDateTime(v.createdAt)}
                  {v.retiredAt ? ` — ${formatDateTime(v.retiredAt)}` : ''}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-fg-subtle">
            Kept because documents signed with them still show them. Replacing your signature never
            changes a document that was already signed.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={confirmRemove}
        title="Remove your signature?"
        description="New documents you sign will print a blank signature line. Documents already signed keep the signature they were signed with — this does not remove it from anything you have already signed."
        confirmLabel="Remove"
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />
    </Card>
  );
}
