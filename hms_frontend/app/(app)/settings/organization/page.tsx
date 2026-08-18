"use client";

import { useEffect, useState } from "react";
import { Badge, Card, Skeleton } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { OrganizationProfile } from "@hms/types";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";
import { ProfileForm, type ProfileField } from "../../../../components/settings/ProfileForm";

/**
 * The hospital's own identity (ADR-049, extended by ADR-056).
 *
 * Registered details are what a tax invoice header legally needs from the supplier;
 * public details are what a patient sees on a registration form or a receipt. Every
 * field is optional and nothing is invented: a document prints the lines that exist and
 * omits the rest, because a wrong address on an invoice is worse than no address.
 *
 * How this prints, and who signs it, is the separate *Letterhead* screen — the same
 * record, split so neither form becomes a wall of inputs.
 */

const FIELDS: ProfileField[] = [
  { key: "legalName", label: "Registered / legal name", hint: "Only if it differs from the name above.", wide: true },
  { key: "displayName", label: "Public display name", hint: "What patients see. Defaults to the name above.", wide: true },
  { key: "addressLine1", label: "Address line 1", wide: true },
  { key: "addressLine2", label: "Address line 2", wide: true },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "postalCode", label: "PIN code", hint: "6 digits." },
  { key: "country", label: "Country" },
  { key: "phone", label: "Phone" },
  { key: "secondaryPhone", label: "Alternate phone", hint: "Reception, emergency or a second line." },
  { key: "email", label: "Email" },
  { key: "supportEmail", label: "Patient support email", hint: "Where patient queries should go." },
  { key: "website", label: "Website", hint: "Include https://" },
  { key: "registrationNumber", label: "Registration number", hint: "Clinical establishment / hospital registration." },
  { key: "gstin", label: "GSTIN", hint: "15 characters." },
];

function Identity() {
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);

  useEffect(() => {
    api.getOrganizationProfile().then(setProfile).catch(() => setProfile(null));
  }, []);

  if (!profile) return <Skeleton height="6rem" />;

  return (
    <Card header="Hospital">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-lg font-semibold text-fg">{profile.name}</span>
        <Badge>{profile.code}</Badge>
        {profile.isComplete ? <Badge tone="success">Ready for documents</Badge> : <Badge tone="warning">Incomplete</Badge>}
      </div>
      <p className="mt-2 text-sm text-fg-muted">
        Your hospital&apos;s name and code were set when Nirogix created your account. Talk to us to change them.
        Everything below is yours to maintain, and appears in the header of every invoice and report you print.
      </p>
    </Card>
  );
}

function OrganizationSettings() {
  return (
    <>
      <Identity />
      <ProfileForm fields={FIELDS} header="Registered and public details">
        {(profile) => (
          <Card header="How this prints">
            {profile.contactLines.length === 0 ? (
              <p className="text-sm text-fg-muted">
                Nothing is configured yet, so your documents print your hospital&apos;s name and logo and no address
                block.
              </p>
            ) : (
              <div className="rounded-token border border-border bg-surface-2 p-4">
                <div className="text-sm font-semibold text-fg">{profile.legalName || profile.name}</div>
                {profile.contactLines.map((line) => (
                  <div key={line} className="text-sm text-fg-muted">
                    {line}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </ProfileForm>
    </>
  );
}

export default function OrganizationSettingsPage() {
  return (
    <RequirePermission perm={PERMISSIONS.ORG_PROFILE_MANAGE}>
      <OrganizationSettings />
    </RequirePermission>
  );
}
