'use client';

// Marketing Light/Dark theme. Mirrors the Portal's approach: an explicit, persisted
// choice applied as `data-theme` on <html>, driving the --mk-* tokens. **Light is the
// default for everyone** (ADR-079) — the OS preference is never consulted; Dark exists
// only as an explicit toggle, persisted for the next visit. A no-flash script in the
// root layout paints the theme before hydration. (Marketing localStorage is its own
// origin, so the `mk-theme` key never collides with the Portal's.)

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'mk-theme';

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

function initialTheme(): Theme {
  // Dark only when the visitor chose it before; anything else — including an OS
  // dark preference — is Light (ADR-079).
  return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    setThemeState(initialTheme());
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
    applyTheme(t);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
