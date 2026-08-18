import type { CSSProperties } from "react";

// Dynamic platform branding for the marketing surface (ADR-024). The root layout fetches the
// `marketing` scope server-side (ISR) and applies the resolved tokens as inline --mk-* overrides
// on <html> (inline beats the :root + dark blocks, so a brand colour applies in both themes,
// with no flash). Falls back to the built-in tokens if the API is unreachable, so the site never
// breaks. Marketing thus trades "fully static" for "ISR-dynamic" — one cached backend read.

const API_BASE = process.env.HMS_API_URL ?? "http://localhost:4000/api/v1";
const REVALIDATE_SECONDS = 300;

interface BrandingTokens {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  surface?: string;
  foreground?: string;
  border?: string;
  buttonBg?: string;
  buttonFg?: string;
}

interface PlatformBranding {
  scope: string;
  tokens: BrandingTokens;
  logoUrl: string | null;
  faviconUrl: string | null;
  version: number;
}

// Branding token key -> marketing CSS variable (resources/DESIGN.md §7). Only the
// theme-safe BRAND FAMILY is applied (primary/secondary/accent/button); the neutral
// surfaces (background/surface/foreground/border) are theme-managed for Light/Dark
// legibility, so they stay schema-reserved and are not overridden here.
const TOKEN_TO_VAR: Partial<Record<keyof BrandingTokens, string>> = {
  primary: "--mk-accent",
  accent: "--mk-accent",
  secondary: "--mk-secondary",
  buttonBg: "--mk-accent",
  buttonFg: "--mk-accent-ink",
};

export async function getMarketingBrandingStyle(): Promise<CSSProperties> {
  try {
    const res = await fetch(`${API_BASE}/public/branding/marketing`, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return {};
    const data = (await res.json()) as PlatformBranding;
    const tokens = data.tokens ?? {};
    const style: Record<string, string> = {};
    for (const key of Object.keys(TOKEN_TO_VAR) as (keyof BrandingTokens)[]) {
      const cssVar = TOKEN_TO_VAR[key];
      const value = tokens[key];
      if (cssVar && value) style[cssVar] = value;
    }
    // A custom accent needs legible button text; default it to white (safe on most brand
    // colours, both themes) unless the admin set buttonFg explicitly.
    if ((tokens.primary || tokens.accent || tokens.buttonBg) && !tokens.buttonFg) {
      style["--mk-accent-ink"] = "#ffffff";
    }
    return style as CSSProperties;
  } catch {
    return {};
  }
}
