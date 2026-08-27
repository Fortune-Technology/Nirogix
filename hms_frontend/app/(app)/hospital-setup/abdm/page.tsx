"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Card, Field, Textarea } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { AbdmFacilityConfig } from "@hms/types";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";
import { useQrDataUrl } from "../../../../lib/useQrDataUrl";
import { ConsentsCard } from "../../../../components/abdm/ConsentsCard";

/**
 * ABDM facility registration (ADR-084).
 *
 * The one piece of ABDM configuration that belongs to the hospital rather than to the platform.
 * NHA issues Nirogix a single application credential — that lives in server configuration and no
 * hospital ever sees it — but each hospital registers its **own** facility in the Health Facility
 * Registry and receives its own facility id. That id is what the gateway routes on and what the
 * Scan-and-Share callback resolves this hospital from, so it has to be stored per tenant.
 *
 * Nothing here is optional decoration: without a facility id there is no Scan-and-Share, which is
 * the fastest path at the desk. The Aadhaar and ABHA-verification flows work without it.
 */
export default function AbdmSettingsPage() {
  return (
    <RequirePermission perm={PERMISSIONS.ABDM_FACILITY_VIEW}>
      <AbdmFacilityForm />
    </RequirePermission>
  );
}

function AbdmFacilityForm() {
  const [config, setConfig] = useState<AbdmFacilityConfig | null>(null);
  const [hipId, setHipId] = useState("");
  const [facilityName, setFacilityName] = useState("");
  const [qrContent, setQrContent] = useState("");
  const [scanShareEnabled, setScanShareEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qr = useQrDataUrl(qrContent.trim() || null, { size: 320 });

  useEffect(() => {
    let alive = true;
    void api
      .getAbdmFacility()
      .then((c) => {
        if (!alive || !c) return;
        setConfig(c);
        setHipId(c.hipId);
        setFacilityName(c.facilityName ?? "");
        setQrContent(c.qrContent ?? "");
        setScanShareEnabled(c.scanShareEnabled);
      })
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : "Could not load the ABDM settings."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      setConfig(
        await api.saveAbdmFacility({
          hipId: hipId.trim(),
          facilityName: facilityName.trim() || undefined,
          qrContent: qrContent.trim() || undefined,
          scanShareEnabled,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the ABDM settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="py-6 text-sm text-fg-muted">Loading…</p>;

  return (
    <form className="mt-5 flex max-w-3xl flex-col gap-5" onSubmit={save}>
      {error && <Alert tone="danger">{error}</Alert>}

      <Card header="Health Facility Registry">
        <p className="mb-4 text-sm text-fg-muted">
          Your hospital&apos;s own ABDM registration. Issued to you by the National Health Authority — we cannot create it
          for you.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Facility ID (HFR)"
            value={hipId}
            onChange={(e) => setHipId(e.target.value)}
            required
            hint="From your Health Facility Registry record. Sent with every ABDM request."
          />
          <Field
            label="Facility name"
            value={facilityName}
            onChange={(e) => setFacilityName(e.target.value)}
            hint="Shown to the patient beside the QR code."
          />
        </div>
      </Card>

      <Card header="Scan &amp; Share">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-fg-muted">
            The fastest way to register a patient: they scan your facility QR in their own ABHA app and their verified
            details arrive at the desk. No OTP, no typing.
          </p>
          <Textarea
            label="Facility QR content"
            value={qrContent}
            onChange={(e) => setQrContent(e.target.value)}
            rows={3}
            hint="Paste the QR payload exactly as the Health Facility Registry gives it. We render the code; we do not invent its contents."
          />

          {qr && (
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- a data URL generated in the browser */}
              <img src={qr} alt="Preview of the facility QR code patients will scan" className="h-32 w-32 rounded-md border border-border bg-white p-2" />
              <p className="text-sm text-fg-muted">
                Preview. Check it scans in a phone camera before you switch this on for the desk.
              </p>
            </div>
          )}

          <label className="flex items-start gap-2 text-sm text-fg-muted">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={scanShareEnabled}
              onChange={(e) => setScanShareEnabled(e.target.checked)}
              disabled={!qrContent.trim() || !hipId.trim()}
            />
            <span>
              Offer Scan &amp; Share at the registration desk. Needs both a facility ID and a QR payload — until then the
              desk sees the Aadhaar and ABHA-verification options only.
            </span>
          </label>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={saving} disabled={hipId.trim().length < 3}>
          Save ABDM settings
        </Button>
        {config && <span className="text-sm text-fg-muted">Registered as {config.hipId}</span>}
      </div>

      {/* Consents other providers hold over this hospital's records (ADR-100). Certification
          requires all three consent cases to be "seen in HMIS", so this exists to be looked at. */}
      <ConsentsCard />
    </form>
  );
}
