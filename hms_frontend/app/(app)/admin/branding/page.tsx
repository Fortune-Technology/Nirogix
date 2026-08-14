"use client";

import { PERMISSIONS } from "@hms/permissions";
import { RequirePermission } from "../../../../components/Can";
import { PageHeader } from "../../../../components/PageHeader";
import { PlatformBrandingPanel } from "../../../../components/PlatformBrandingPanel";

// Super-Admin platform branding (ADR-024): two INDEPENDENT scopes. Distinct from the
// per-tenant branding an org_admin sets in Settings. Gated to the platform owner.
export default function PlatformBrandingPage() {
  return (
    <RequirePermission perm={PERMISSIONS.PLATFORM_BRANDING_MANAGE}>
      <PageHeader
        title="Platform branding"
        description="Brand the public marketing website and the HMS Portal default independently. Leave a field blank to use the built-in default; a hospital's own branding still overrides the HMS default for its users."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <PlatformBrandingPanel
          scope="marketing"
          title="Marketing website"
          description="Colours for the public site (root domain). Applied live within a few minutes."
        />
        <PlatformBrandingPanel
          scope="hms"
          title="HMS Portal (default)"
          description="The Portal's default palette, before any per-tenant branding."
        />
      </div>
    </RequirePermission>
  );
}
