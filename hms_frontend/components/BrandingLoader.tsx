"use client";

import { useEffect } from "react";
import { useTheme } from "../lib/theme";
import * as api from "../lib/api";

// Layers the platform "hms" brand default (ADR-024) UNDER the per-tenant override.
// The platform default is injected as a :root rule (stylesheet), so the per-tenant
// value — set inline on <html> (higher priority) — always wins; when a tenant has no
// branding, the platform default shows through. Only the theme-safe brand colour is
// layered; neutral surfaces stay theme-managed.
function applyPlatformHmsDefault(tokens: Record<string, string | undefined>): void {
  const brand = tokens.primary ?? tokens.accent ?? tokens.buttonBg;
  const id = "platform-hms-branding";
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!brand) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = `:root{--hms-brand:${brand};}`;
}

// Loads branding once the user is authenticated: the platform "hms" default first, then
// the tenant's own branding applied on top (ADR-021 + ADR-024). Renders nothing.
export function BrandingLoader() {
  const { applyBranding } = useTheme();
  useEffect(() => {
    api
      .getPlatformBranding("hms")
      .then((b) => applyPlatformHmsDefault(b.tokens as Record<string, string | undefined>))
      .catch(() => {
        /* no platform default configured — keep the built-in tokens */
      })
      .finally(() => {
        api.getCurrentBranding().then(applyBranding).catch(() => {
          /* no tenant branding / not reachable — keep the default tokens */
        });
      });
  }, [applyBranding]);
  return null;
}
