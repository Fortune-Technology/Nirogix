'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Download, ExternalLink, Printer, RefreshCw } from 'lucide-react';
import { Alert, Badge, Button, Card, ConfirmDialog, ErrorState, Skeleton } from '@hms/ui';
import * as api from '../../lib/api';
import { notifySuccess } from '../../lib/feedback';
import { useDocumentBrand } from '../print/useDocumentBrand';

/**
 * One settings panel for every ADR-056-pattern public surface (self-registration,
 * online booking, and whatever token-fronted request flow comes next). The two screens
 * were line-for-line copies; the rule is one implementation configured twice, so the
 * toggle/QR/link/regenerate mechanics live here and a page supplies only its words,
 * its API calls and its QR hook.
 */

/** The shape both settings endpoints share. */
export interface PublicAccessSettings {
  enabled: boolean;
  token: string | null;
  pendingCount: number;
}

type Brand = ReturnType<typeof useDocumentBrand>['brand'];

export interface PublicAccessPanelProps {
  /** Card title, e.g. "Patient self-registration". */
  title: string;
  /** Noun used in labels and toasts: "Registration link" / "Booking link". */
  linkLabel: string;
  /** The explainer paragraph under the toggle — each surface states its own promise. */
  explainer: ReactNode;
  /** Where the pending-count badge points; omit for a plain badge. */
  pendingHref?: string;
  /** Alt text for the QR preview image. */
  qrAlt: string;
  /** Filename for the downloaded QR png. */
  downloadName: string;
  /** The poster's print route. */
  printHref: string;
  /** Copy for the disable confirmation title. */
  confirmDisableTitle: string;
  /** Copy shown while the surface is off (first clause of the shared Alert). */
  disabledNoun: string;
  /** API surface. */
  load: () => Promise<PublicAccessSettings>;
  setEnabled: (enabled: boolean) => Promise<PublicAccessSettings>;
  regenerate: () => Promise<PublicAccessSettings>;
  /**
   * The QR hook for this surface (module-level, stable identity — it is called
   * unconditionally on every render, so the rules of hooks hold).
   */
  useQr: (token: string | null, brand: Brand) => { url: string | null; qr: string | null };
}

export function PublicAccessPanel(props: PublicAccessPanelProps) {
  const router = useRouter();
  const { brand } = useDocumentBrand();
  const [settings, setSettings] = useState<PublicAccessSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  // One definition of the link and the code, shared with the printable poster — so what
  // an administrator previews here is exactly what comes out of the printer.
  const { url, qr: qrImage } = props.useQr(settings?.token ?? null, brand);

  const load = useCallback(() => {
    props
      .load()
      .then((s) => {
        setSettings(s);
        setError(null);
      })
      .catch((e) =>
        setError(e instanceof api.ApiRequestError ? e.message : 'Could not load these settings.'),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- props.load is a module-level fn
  }, [props.load]);

  useEffect(() => load(), [load]);

  async function run(action: () => Promise<PublicAccessSettings>) {
    setBusy(true);
    try {
      setSettings(await action());
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setBusy(false);
      setConfirmDisable(false);
      setConfirmRegen(false);
    }
  }

  function copy() {
    if (!url) return;
    void navigator.clipboard.writeText(url).then(() => notifySuccess(`${props.linkLabel} copied.`));
  }

  function download() {
    if (!qrImage) return;
    const a = document.createElement('a');
    a.href = qrImage;
    a.download = props.downloadName;
    a.click();
  }

  if (error)
    return (
      <ErrorState
        title={`Could not load ${props.title.toLowerCase()} settings`}
        message={error}
        onRetry={load}
      />
    );
  if (!settings) return <Skeleton height="20rem" />;

  const pendingBadge = <Badge tone="warning">{settings.pendingCount} awaiting review</Badge>;

  return (
    <>
      <Card header={props.title}>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={settings.enabled ? 'success' : 'neutral'}>
            {settings.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
          {settings.pendingCount > 0 ? (
            props.pendingHref ? (
              <Link
                href={props.pendingHref}
                className="inline-flex"
                aria-label={`${settings.pendingCount} requests awaiting review`}
              >
                {pendingBadge}
              </Link>
            ) : (
              pendingBadge
            )
          ) : null}
          <span className="flex-1" />
          {settings.enabled ? (
            <Button variant="secondary" onClick={() => setConfirmDisable(true)} disabled={busy}>
              Turn off
            </Button>
          ) : (
            <Button onClick={() => void run(() => props.setEnabled(true))} loading={busy}>
              Turn on
            </Button>
          )}
        </div>

        <p className="mt-4 text-sm text-fg-muted">{props.explainer}</p>
      </Card>

      {settings.enabled && url ? (
        <Card header="Your hospital's QR code">
          <div className="flex flex-col gap-5 sm:flex-row">
            <div className="shrink-0">
              {qrImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- a generated data: URI, not a remote asset
                <img
                  src={qrImage}
                  alt={props.qrAlt}
                  className="h-44 w-44 rounded-token border border-border bg-white p-2"
                />
              ) : (
                <Skeleton height="11rem" width="11rem" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <span className="hms-label">{props.linkLabel}</span>
              <p className="mt-1 break-all rounded-token border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-fg">
                {url}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={copy}>
                  <Copy size={15} strokeWidth={2} /> Copy link
                </Button>
                <Button variant="secondary" size="sm" onClick={download} disabled={!qrImage}>
                  <Download size={15} strokeWidth={2} /> Download QR
                </Button>
                <Button variant="secondary" size="sm" onClick={() => router.push(props.printHref)}>
                  <Printer size={15} strokeWidth={2} /> Print poster
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink size={15} strokeWidth={2} /> Preview form
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmRegen(true)}
                  disabled={busy}
                >
                  <RefreshCw size={15} strokeWidth={2} /> Regenerate
                </Button>
              </div>

              <p className="mt-3 text-xs text-fg-subtle">
                Print or display this at reception, the entrance, the waiting area or on your
                website. The code carries only a link. No patient or hospital information is stored
                in it. It is drawn in your hospital&apos;s colour, darkened only if that is needed
                to keep it scannable.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {!settings.enabled ? (
        <Alert>
          While {props.disabledNoun} is off, the link and QR code stop working. Your existing
          posters will start working again if you turn it back on. The code does not change unless
          you regenerate it.
        </Alert>
      ) : null}

      <ConfirmDialog
        open={confirmDisable}
        title={props.confirmDisableTitle}
        description="Your QR code and link stop working immediately. Requests already waiting for review are not affected, and your code stays the same if you turn it back on."
        confirmLabel="Turn off"
        tone="danger"
        busy={busy}
        onConfirm={() => void run(() => props.setEnabled(false))}
        onCancel={() => setConfirmDisable(false)}
      />

      <ConfirmDialog
        open={confirmRegen}
        title="Issue a new QR code?"
        description="Every printed poster and shared link stops working immediately, and you will need to reprint. Do this if a poster has been altered or the link has been shared somewhere it should not be."
        confirmLabel="Regenerate"
        tone="danger"
        busy={busy}
        onConfirm={() => void run(props.regenerate)}
        onCancel={() => setConfirmRegen(false)}
      />
    </>
  );
}
