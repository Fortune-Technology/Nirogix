"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@hms/client";
import { ThemeProvider } from "../lib/theme";
import { apiClient } from "../lib/api";

/**
 * Client context for the admin app, composed once and mounted from the root layout.
 *
 * The session provider is the shared one (ADR-054); it is given *this* app's client,
 * so the endpoint surface stays narrow while the session logic has one implementation.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider api={apiClient}>{children}</AuthProvider>
    </ThemeProvider>
  );
}
