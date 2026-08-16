"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@hms/client";
import { ThemeProvider } from "../lib/theme";
import { apiClient } from "../lib/api";

/**
 * Client context for the AI Portal.
 *
 * Uses the **shared** session provider (ADR-054): sign-in here is the ordinary staff
 * flow against the same backend, so there is nothing about the session that differs.
 * What differs is the gate — `ai.portal.access` — and that is checked on the route,
 * not in the provider.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider api={apiClient}>{children}</AuthProvider>
    </ThemeProvider>
  );
}
