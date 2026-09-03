'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Badge, Button, Card, Field } from '@hms/ui';
import { PERMISSIONS } from '@hms/permissions';
import * as api from '../../../../lib/api';
import { useTheme } from '../../../../lib/theme';
import { RequirePermission } from '../../../../components/Can';

const DEFAULT_BRAND = '#0e7490';
const DEFAULT_SECONDARY = '#334155';

/**
 * Tenant branding (ADR-021, ADR-040). One accent token drives hover, pressed, subtle
 * and the focus ring, so a hospital cannot produce an unreadable interface by picking
 * a single colour. The logo and favicon go through the same file storage as every
 * other upload, and both reach the hospital's printed documents (ADR-047).
 *
 * Success and failure are announced by the shared toast raised inside the API client
 * (ADR-026) — this screen keeps no notification state of its own.
 */
function BrandingEditor() {
  const { applyBranding, previewBrandColor, logoUrl } = useTheme();
  const [brand, setBrand] = useState(DEFAULT_BRAND);
  const [secondary, setSecondary] = useState(DEFAULT_SECONDARY);
  const [saving, setSaving] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const faviconInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .getCurrentBranding()
      .then((b) => {
        if (b.brandColor) setBrand(b.brandColor);
        if (b.secondaryColor) setSecondary(b.secondaryColor);
      })
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    try {
      applyBranding(await api.updateBranding({ brandColor: brand, secondaryColor: secondary }));
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setSaving(false);
    }
  }

  async function upload(kind: 'logo' | 'favicon', file: File | undefined) {
    if (!file) return;
    try {
      applyBranding(await api.uploadBrandingAsset(kind, file));
    } catch {
      /* reported by the shared API-feedback layer */
    }
  }

  async function reset() {
    try {
      applyBranding(await api.resetBranding());
      previewBrandColor(null);
      setBrand(DEFAULT_BRAND);
      setSecondary(DEFAULT_SECONDARY);
    } catch {
      /* reported by the shared API-feedback layer */
    }
  }

  return (
    <Card header="Branding">
      <p className="mb-4 text-sm text-fg-muted">
        The accent colour is a single token. Pick one and every button, link, badge and highlight
        updates instantly, in both themes. Persisted for your whole organization, and carried onto
        the invoices and reports you print.
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="hms-field">
          <span className="hms-label">Primary / brand colour</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={brand}
              onChange={(e) => {
                setBrand(e.target.value);
                previewBrandColor(e.target.value);
              }}
              className="h-10 w-14 cursor-pointer rounded-token border border-border bg-surface"
              aria-label="Brand colour"
            />
            <Field
              value={brand}
              onChange={(e) => {
                setBrand(e.target.value);
                previewBrandColor(e.target.value);
              }}
              className="font-mono"
            />
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
            <Field
              value={secondary}
              onChange={(e) => setSecondary(e.target.value)}
              className="font-mono"
            />
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={save} loading={saving}>
          Save colours
        </Button>
        <Button variant="secondary" onClick={reset}>
          Reset to default
        </Button>
        <Badge tone="brand">Live preview active</Badge>
      </div>

      <div className="mt-6 grid gap-5 border-t border-border pt-5 sm:grid-cols-2">
        <div>
          <span className="hms-label">Logo</span>
          <div className="mt-2 flex items-center gap-3">
            {logoUrl ? (
              // Tenant-uploaded asset from per-deployment storage — see AppShell.
              <Image
                src={logoUrl}
                alt="Current organization logo"
                width={40}
                height={40}
                unoptimized
                className="h-10 w-10 rounded-token border border-border object-contain"
              />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-token bg-surface-2 text-xs text-fg-subtle">
                none
              </span>
            )}
            <input
              ref={logoInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => upload('logo', e.target.files?.[0])}
            />
            <Button variant="secondary" size="sm" onClick={() => logoInput.current?.click()}>
              Upload logo
            </Button>
          </div>
        </div>
        <div>
          <span className="hms-label">Favicon</span>
          <div className="mt-2 flex items-center gap-3">
            <input
              ref={faviconInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => upload('favicon', e.target.files?.[0])}
            />
            <Button variant="secondary" size="sm" onClick={() => faviconInput.current?.click()}>
              Upload favicon
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function BrandingSettingsPage() {
  return (
    <RequirePermission perm={PERMISSIONS.BRANDING_MANAGE}>
      <BrandingEditor />
    </RequirePermission>
  );
}
