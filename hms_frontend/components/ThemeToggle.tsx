"use client";

import { Button } from "@hms/ui";
import { useTheme } from "../lib/theme";

// Light/Dark switch. The Portal must be verified in both themes before "done".
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <Button variant="ghost" size="sm" onClick={toggle} aria-label="Toggle theme" title="Toggle light / dark">
      {theme === "dark" ? "☀ Light" : "☾ Dark"}
    </Button>
  );
}
