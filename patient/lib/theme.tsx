"use client";

/**
 * Theme for the patient portal (ADR-051).
 *
 * Deliberately simpler than the Portal's: there is **no tenant branding here**. This
 * app is the platform's own surface, so it always wears the Nirogix accent. An
 * operator working inside a hospital does so through a support session in the
 * Portal, not by repainting this app in the customer's colours — a console that
 * changes appearance depending on whose data is on screen is a console you can
 * misread under pressure.
 *
 * Light is the default; Dark is an explicit, persisted choice applied as
 * `data-theme` on `<html>`, matching every other Nirogix surface.
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Its own storage key, on its own origin — nothing is shared with the Portal.
const THEME_KEY = "nirogix-patient-theme";

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY);
    const initial: Theme = stored === "dark" ? "dark" : "light";
    setThemeState(initial);
    applyTheme(initial);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    try {
      window.localStorage.setItem(THEME_KEY, t);
    } catch {
      /* private mode — the choice simply does not persist */
    }
  }, []);

  const toggle = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [theme, setTheme]);

  return <ThemeContext.Provider value={{ theme, toggle, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
