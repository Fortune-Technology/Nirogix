"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, ExternalLink, Printer, RefreshCw } from "lucide-react";
import { Alert, Badge, Button, Card, ConfirmDialog, ErrorState, Skeleton } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { RegistrationSettings } from "@hms/types";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";
import { notifySuccess } from "../../../../lib/feedback";
import { useDocumentBrand } from "../../../../components/print/useDocumentBrand";
import { useRegistrationQr } from "../../../../components/print/useRegistrationQr";

/**
 * Patient self-registration (ADR-056).
 *
 * The QR encodes a **public URL carrying an opaque token** — not the tenant id, not a
 * patient id, not configuration, and nothing authenticating. The backend resolves the
 * hospital from that token on every call, which is what makes "a QR for Hospital A can
 * never register a patient at Hospital B" structural rather than a rule to remember.
 *
 * The screen is careful about one thing above all: a submission is a **request**, not a
 * patient. The front desk converts it. If this page implied otherwise, a hospital would
 * reasonably expect scanned strangers to appear in its patient list.
 *
 * The code itself is drawn in the hospital's own accent, darkened only as far as it must
 * be to stay scannable, and the printable poster is a real document route carrying the
 * hospital's logo and address (ADR-047) rather than a hand-built popup.
 */

function RegistrationPanel() {
  const router = useRouter();
  const { brand } = useDocumentBrand();
  const [settings, setSettings] = useState<RegistrationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  // One definition of the link and the code, shared with the printable poster — so what
  // an administrator previews here is exactly what comes out of the printer.
  const { url, qr: qrImage } = useRegistrationQr(settings?.token ?? null, brand);

  const load = useCallback(() => {
    api
      .getRegistrationSettings()
      .then((s) => {
        setSettings(s);
        setError(null);
      })
      .catch((e) => setError(e instanceof api.ApiRequestError ? e.message : "Could not load registration settings."));
  }, []);

  useEffect(() => load(), [load]);

  async function run(action: () => Promise<RegistrationSettings>) {
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
    void navigator.clipboard.writeText(url).then(() => notifySuccess("Registration link copied."));
  }

  function download() {
    if (!qrImage) return;
    const a = document.createElement("a");
    a.href = qrImage;
    a.download = "nirogix-patient-registration-qr.png";
    a.click();
  }

  if (error) return <ErrorState title="Could not load registration settings" message={error} onRetry={load} />;
  if (!settings) return <Skeleton height="20rem" />;

  return (
    <>
      <Card header="Patient self-registration">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={settings.enabled ? "success" : "neutral"}>{settings.enabled ? "Enabled" : "Disabled"}</Badge>
          {settings.pendingCount > 0 ? (
            <Badge tone="warning">{settings.pendingCount} awaiting review</Badge>
          ) : null}
          <span className="flex-1" />
          {settings.enabled ? (
            <Button variant="secondary" onClick={() => setConfirmDisable(true)} disabled={busy}>
              Turn off
            </Button>
          ) : (
            <Button onClick={() => void run(() => api.setSelfRegistration(true))} loading={busy}>
              Turn on
            </Button>
          )}
        </div>

        <p className="mt-4 text-sm text-fg-muted">
          Patients scan your QR code and send their details before they reach the desk.{" "}
          <strong className="font-medium text-fg">Nothing is added to your patient list automatically</strong> — each
          submission arrives as a request your front desk reviews, checks against existing records, and converts into a
          patient. You stay in control of who is in your records.
        </p>
      </Card>

      {settings.enabled && url ? (
        <Card header="Your hospital's QR code">
          <div className="flex flex-col gap-5 sm:flex-row">
            <div className="shrink-0">
              {qrImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- a generated data: URI, not a remote asset
                <img
                  src={qrImage}
                  alt="QR code linking to this hospital's patient registration form"
                  className="h-44 w-44 rounded-token border border-border bg-white p-2"
                />
              ) : (
                <Skeleton height="11rem" width="11rem" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <span className="hms-label">Registration link</span>
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
                <Button variant="secondary" size="sm" onClick={() => router.push("/print/registration-qr")}>
                  <Printer size={15} strokeWidth={2} /> Print poster
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink size={15} strokeWidth={2} /> Preview form
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirmRegen(true)} disabled={busy}>
                  <RefreshCw size={15} strokeWidth={2} /> Regenerate
                </Button>
              </div>

              <p className="mt-3 text-xs text-fg-subtle">
                Print or display this at reception, the entrance, the waiting area or on your website. The code carries
                only a link — no patient or hospital information is stored in it. It is drawn in your hospital&apos;s
                colour, darkened only if that is needed to keep it scannable.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {!settings.enabled ? (
        <Alert>
          While self-registration is off, the link and QR code stop working. Your existing posters will start working
          again if you turn it back on — the code does not change unless you regenerate it.
        </Alert>
      ) : null}

      <ConfirmDialog
        open={confirmDisable}
        title="Turn off patient self-registration?"
        description="Your QR code and link stop working immediately. Requests already waiting for review are not affected, and your code stays the same if you turn it back on."
        confirmLabel="Turn off"
        tone="danger"
        busy={busy}
        onConfirm={() => void run(() => api.setSelfRegistration(false))}
        onCancel={() => setConfirmDisable(false)}
      />

      <ConfirmDialog
        open={confirmRegen}
        title="Issue a new QR code?"
        description="Every printed poster and shared link stops working immediately, and you will need to reprint. Do this if a poster has been altered or the link has been shared somewhere it should not be."
        confirmLabel="Regenerate"
        tone="danger"
        busy={busy}
        onConfirm={() => void run(() => api.regenerateRegistrationToken())}
        onCancel={() => setConfirmRegen(false)}
      />
    </>
  );
}

export default function RegistrationSettingsPage() {
  return (
    <RequirePermission perm={PERMISSIONS.ORG_PROFILE_MANAGE}>
      <RegistrationPanel />
    </RequirePermission>
  );
}
