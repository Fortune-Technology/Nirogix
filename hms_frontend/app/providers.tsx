"use client";

import type { ReactNode } from "react";
import { NumberInputGuard } from "@hms/ui";
import { AuthProvider } from "@hms/client";
import { ThemeProvider } from "../lib/theme";
import { apiClient } from "../lib/api";

/**
 * All client-side context providers, composed once and mounted from the root layout.
 *
 * The session provider is the shared one (ADR-054), given *this* app's client — so the
 * Portal keeps its own endpoint surface while the session logic has one implementation.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      {/* One listener for the whole app: a wheel over a focused number field scrolls the
          page instead of silently editing the value (ADR-127). */}
      <NumberInputGuard />
      <AuthProvider api={apiClient}>{children}</AuthProvider>
    </ThemeProvider>
  );
}
