'use client';

// Theme + branding context. Light is the product default; Dark is an explicit, persisted user
// choice applied as `data-theme` on <html>. **Branding is server-persisted per tenant** (ADR-021):
// the Portal loads it at session bootstrap and applies it through the `--hms-*` token seam — the
// brand colour drives every button/link/highlight; the logo + favicon are shown platform-wide.
// A cached brand colour in localStorage lets the no-flash script paint it before hydration.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Branding } from '@hms/types';

export type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
  // Branding (from the server).
  brandColor: string | null;
  logoUrl: string | null;
  applyBranding: (b: Branding) => void;
  /** Live preview of a brand colour while editing (does not persist). */
  previewBrandColor: (hex: string | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_KEY = 'hms-theme';
const BRAND_CACHE_KEY = 'hms-brand'; // paint-cache only; the server is the source of truth

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

// Only the brand slot is set: hover, pressed, subtle and the focus ring are derived
// from it in the token layer, so a tenant accent carries through every state
// (rules.md → Branding & Multi-Tenant Customization).
function applyBrandColor(hex: string | null): void {
  const root = document.documentElement;
  if (hex) root.style.setProperty('--hms-brand', hex);
  else root.style.removeProperty('--hms-brand');
}

function applyFavicon(url: string | null): void {
  if (!url) return;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = url;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [brandColor, setBrandColor] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    const storedTheme = (localStorage.getItem(THEME_KEY) as Theme | null) ?? 'light';
    setThemeState(storedTheme === 'dark' ? 'dark' : 'light');
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
    applyTheme(t);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
      return next;
    });
  }, []);

  const applyBranding = useCallback((b: Branding) => {
    applyBrandColor(b.brandColor);
    applyFavicon(b.faviconUrl);
    setBrandColor(b.brandColor);
    setLogoUrl(b.logoUrl);
    if (b.brandColor) localStorage.setItem(BRAND_CACHE_KEY, b.brandColor);
    else localStorage.removeItem(BRAND_CACHE_KEY);
  }, []);

  const previewBrandColor = useCallback((hex: string | null) => {
    applyBrandColor(hex);
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme, toggle, setTheme, brandColor, logoUrl, applyBranding, previewBrandColor }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
