"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "../lib/theme";
import { AuthProvider } from "../lib/auth";

// All client-side context providers, composed once and mounted from the root layout.
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}
