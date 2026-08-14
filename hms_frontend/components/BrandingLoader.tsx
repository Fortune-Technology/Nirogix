"use client";

import { useEffect } from "react";
import { useTheme } from "../lib/theme";
import * as api from "../lib/api";

// Loads the tenant's server-persisted branding once the user is authenticated and applies it
// through the token seam (ADR-021). Renders nothing. Mounted inside the authenticated shell.
export function BrandingLoader() {
  const { applyBranding } = useTheme();
  useEffect(() => {
    api.getCurrentBranding().then(applyBranding).catch(() => {
      /* no branding configured / not reachable — keep the default tokens */
    });
  }, [applyBranding]);
  return null;
}
