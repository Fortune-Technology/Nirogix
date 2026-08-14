"use client";

// Theme + branding context. Light is the product default; Dark is an explicit,
// persisted user choice applied as `data-theme` on <html>. Tenant branding
// overrides `--hms-brand` at runtime, so one build re-skins per tenant.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
  brand: string | null;
  setBrand: (hex: string | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_KEY = "hms-theme";
const BRAND_KEY = "hms-brand";

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
}
function applyBrand(hex: string | null): void {
  const root = document.documentElement;
  if (hex) root.style.setProperty("--hms-brand", hex);
  else root.style.removeProperty("--hms-brand");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [brand, setBrandState] = useState<string | null>(null);

  // Hydrate from what the no-flash script already applied (localStorage).
  useEffect(() => {
    const storedTheme = (localStorage.getItem(THEME_KEY) as Theme | null) ?? "light";
    setThemeState(storedTheme === "dark" ? "dark" : "light");
    setBrandState(localStorage.getItem(BRAND_KEY));
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
    applyTheme(t);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
      return next;
    });
  }, []);

  const setBrand = useCallback((hex: string | null) => {
    setBrandState(hex);
    if (hex) localStorage.setItem(BRAND_KEY, hex);
    else localStorage.removeItem(BRAND_KEY);
    applyBrand(hex);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme, brand, setBrand }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
