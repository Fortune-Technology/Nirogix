'use client';

import { Moon, Sun } from 'lucide-react';
import { Button } from '@hms/ui';
import { useTheme } from '../lib/theme';

// Light/Dark switch. The Portal must be verified in both themes before "done".
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title="Toggle light / dark"
    >
      {dark ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
      {dark ? 'Light' : 'Dark'}
    </Button>
  );
}
