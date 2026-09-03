'use client';

import type { ReactNode } from 'react';
import { NumberInputGuard } from '@hms/ui';
import { ThemeProvider } from '../lib/theme';
import { SessionProvider } from '../lib/session';

/** Client context for the patient portal, composed once and mounted from the root layout. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      {/* One listener for the whole app: a wheel over a focused number field scrolls the
          page instead of silently editing the value (ADR-127). */}
      <NumberInputGuard />
      <SessionProvider>{children}</SessionProvider>
    </ThemeProvider>
  );
}
