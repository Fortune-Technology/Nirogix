"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@hms/ui";
import { useTheme } from "../lib/theme";

// Light/Dark switch — the same pattern as the Portal's (`hms_frontend/components/
// ThemeToggle.tsx`): a ghost button so the icon sits flush with the header, with no
// filled square behind it. The only difference is the theme hook, which is this
// app's own (no tenant branding — ADR-051). Verified in both themes before "done".
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title="Toggle light / dark"
    >
      {dark ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
      {dark ? "Light" : "Dark"}
    </Button>
  );
}
