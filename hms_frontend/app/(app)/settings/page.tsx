"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Field } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import * as api from "../../../lib/api";
import { useTheme } from "../../../lib/theme";
import { Can } from "../../../components/Can";
import { PageHeader } from "../../../components/PageHeader";

const DEFAULT_BRAND = "#0e7490";
const DEFAULT_SECONDARY = "#334155";

function BrandingEditor() {
  const { applyBranding, previewBrandColor, logoUrl } = useTheme();
  const [brand, setBrand] = useState(DEFAULT_BRAND);
  const [secondary, setSecondary] = useState(DEFAULT_SECONDARY);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const faviconInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getCurrentBranding().then((b) => {
      if (b.brandColor) setBrand(b.brandColor);
      if (b.secondaryColor) setSecondary(b.secondaryColor);
    }).catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const b = await api.updateBranding({ brandColor: brand, secondaryColor: secondary });
      applyBranding(b);
      setMsg("Branding saved.");
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Could not save branding.");
    } finally {
      setSaving(false);
    }
  }

  async function upload(kind: "logo" | "favicon", file: File | undefined) {
    if (!file) return;
    setError(null);
    setMsg(null);
    try {
      const b = await api.uploadBrandingAsset(kind, file);
      applyBranding(b);
      setMsg(`${kind === "logo" ? "Logo" : "Favicon"} updated.`);
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Upload failed.");
    }
  }

  async function reset() {
    setError(null);
    setMsg(null);
    try {
      const b = await api.resetBranding();
      applyBranding(b);
      previewBrandColor(null);
      setBrand(DEFAULT_BRAND);
      setSecondary(DEFAULT_SECONDARY);
      setMsg("Branding reset to default.");
    } catch (e) {
      setError(e instanceof api.ApiRequestError ? e.message : "Reset failed.");
    }
  }

  return (
    <Card header="Tenant branding">
      {msg && <Alert tone="success">{msg}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}

      <p className="mb-4 text-sm text-fg-muted">
        The accent colour is a single token — pick one and every button, link, badge, and highlight updates instantly,
        in both themes. Persisted per tenant and applied for all your organization&apos;s users.
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="hms-field">
          <span className="hms-label">Primary / brand colour</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={brand}
              onChange={(e) => { setBrand(e.target.value); previewBrandColor(e.target.value); }}
              className="h-10 w-14 cursor-pointer rounded-token border border-border bg-surface"
              aria-label="Brand colour"
            />
            <Field value={brand} onChange={(e) => { setBrand(e.target.value); previewBrandColor(e.target.value); }} className="font-mono" />
          </div>
        </div>
        <div className="hms-field">
          <span className="hms-label">Secondary colour (reserved)</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={secondary}
              onChange={(e) => setSecondary(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-token border border-border bg-surface"
              aria-label="Secondary colour"
            />
            <Field value={secondary} onChange={(e) => setSecondary(e.target.value)} className="font-mono" />
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={save} loading={saving}>Save colours</Button>
        <Button variant="secondary" onClick={reset}>Reset to default</Button>
        <Badge tone="brand">Live preview active</Badge>
      </div>

      <div className="mt-6 grid gap-5 border-t border-border pt-5 sm:grid-cols-2">
        <div>
          <span className="hms-label">Logo</span>
          <div className="mt-2 flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Current logo" className="h-10 w-10 rounded-token border border-border object-contain" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-token bg-surface-2 text-xs text-fg-subtle">none</span>
            )}
            <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={(e) => upload("logo", e.target.files?.[0])} />
            <Button variant="secondary" size="sm" onClick={() => logoInput.current?.click()}>Upload logo</Button>
          </div>
        </div>
        <div>
          <span className="hms-label">Favicon</span>
          <div className="mt-2 flex items-center gap-3">
            <input ref={faviconInput} type="file" accept="image/*" className="hidden" onChange={(e) => upload("favicon", e.target.files?.[0])} />
            <Button variant="secondary" size="sm" onClick={() => faviconInput.current?.click()}>Upload favicon</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const { theme, toggle } = useTheme();
  return (
    <>
      <PageHeader title="Settings" description="Appearance and tenant branding." />

      <Card header="Theme">
        <div className="flex items-center gap-3">
          <span className="text-sm text-fg-muted">Current:</span>
          <Badge tone="brand">{theme === "dark" ? "Dark" : "Light"}</Badge>
          <Button variant="secondary" size="sm" onClick={toggle}>
            Switch to {theme === "dark" ? "Light" : "Dark"}
          </Button>
        </div>
      </Card>

      <Can perm={PERMISSIONS.BRANDING_MANAGE} fallback={<Card header="Tenant branding"><p className="text-sm text-fg-muted">You don&apos;t have permission to edit branding.</p></Card>}>
        <BrandingEditor />
      </Can>
    </>
  );
}
