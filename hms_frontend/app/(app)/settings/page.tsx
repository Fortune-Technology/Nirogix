"use client";

import { Badge, Button, Card } from "@hms/ui";
import { useTheme } from "../../../lib/theme";
import { PageHeader } from "../../../components/PageHeader";

// Brand presets to demonstrate that the whole design system re-skins from a single
// token (--hms-brand) — the same build serves any tenant's colour.
const BRAND_PRESETS: Array<{ name: string; hex: string }> = [
  { name: "CityCare Teal (default)", hex: "#0e7490" },
  { name: "Indigo", hex: "#4f46e5" },
  { name: "Emerald", hex: "#059669" },
  { name: "Rose", hex: "#e11d48" },
  { name: "Amber", hex: "#d97706" },
];

export default function SettingsPage() {
  const { theme, toggle, brand, setBrand } = useTheme();

  return (
    <>
      <PageHeader title="Settings" description="Appearance and tenant branding (design-system demonstration)." />

      <Card header="Theme">
        <div className="flex items-center gap-3">
          <span className="text-sm text-fg-muted">Current:</span>
          <Badge tone="brand">{theme === "dark" ? "Dark" : "Light"}</Badge>
          <Button variant="secondary" size="sm" onClick={toggle}>
            Switch to {theme === "dark" ? "Light" : "Dark"}
          </Button>
        </div>
      </Card>

      <Card header="Tenant branding">
        <p className="mb-3 text-sm text-fg-muted">
          The accent colour is a single token. Pick a preset — every button, badge, link, and highlight updates
          instantly, in both themes.
        </p>
        <div className="flex flex-wrap gap-2">
          {BRAND_PRESETS.map((p) => (
            <button
              key={p.hex}
              onClick={() => setBrand(p.hex === "#0e7490" ? null : p.hex)}
              className="flex items-center gap-2 rounded-token border border-border bg-surface px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-2"
            >
              <span className="inline-block h-4 w-4 rounded-full" style={{ background: p.hex }} aria-hidden />
              {p.name}
            </button>
          ))}
        </div>
        {brand && (
          <p className="mt-3 text-sm text-fg-muted">
            Active brand override: <code className="text-fg">{brand}</code>
          </p>
        )}
      </Card>
    </>
  );
}
