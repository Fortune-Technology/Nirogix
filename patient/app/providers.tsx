"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "../lib/theme";
import { SessionProvider } from "../lib/session";

/** Client context for the patient portal, composed once and mounted from the root layout. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <SessionProvider>{children}</SessionProvider>
    </ThemeProvider>
  );
}
