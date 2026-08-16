"use client";

import { Alert, Card } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import { RequirePermission } from "../../../../components/Can";
import { ProfileForm, type ProfileField } from "../../../../components/settings/ProfileForm";

/**
 * Letterhead (ADR-056).
 *
 * A printed document already carries the hospital's logo, name, address and colour from
 * branding and the organization profile (ADR-047, ADR-049). What was missing is the part
 * a hospital writes for itself: the line under the name, the strip along the bottom of
 * the page, and who signs. Those are the fields here — nothing else, because a document
 * that invents a tagline or a signatory is a document a hospital cannot legally issue.
 *
 * These are *defaults for every printed document*, not a per-document editor.
 */

const FIELDS: ProfileField[] = [
  {
    key: "letterheadHeader",
    label: "Header line",
    hint: "Printed under your hospital's name — a tagline, accreditation, or the department.",
    wide: true,
  },
  {
    key: "letterheadFooter",
    label: "Footer text",
    hint: "Printed along the bottom of every page — hours, a disclaimer, or where to call.",
    wide: true,
    multiline: true,
  },
  { key: "signatoryName", label: "Default signatory", hint: "Whose name prints on the signature line." },
  { key: "signatoryDesignation", label: "Signatory designation", hint: "For example, Medical Superintendent." },
];

function LetterheadSettings() {
  return (
    <>
      <ProfileForm
        fields={FIELDS}
        header="Letterhead"
        intro="What Nirogix prints at the top and bottom of your invoices, receipts, prescriptions and reports. Leave a field empty and that line simply does not print."
      >
        {(profile) => (
          <Card header="Preview">
            {/* Deliberately plain — the real document carries the tenant's own branding and
                is rendered by the shared print kit. This shows the copy, not the colours. */}
            <div className="rounded-token border border-border bg-surface-2 p-5">
              <div className="border-b border-border pb-3">
                <div className="text-base font-semibold text-fg">{profile.displayName || profile.name}</div>
                {profile.letterheadHeader ? (
                  <div className="text-sm text-fg-muted">{profile.letterheadHeader}</div>
                ) : null}
                {profile.contactLines.map((line) => (
                  <div key={line} className="text-xs text-fg-subtle">
                    {line}
                  </div>
                ))}
              </div>

              <div className="py-8 text-center text-xs text-fg-subtle">Document content</div>

              {profile.signatoryName ? (
                <div className="mb-3 text-right">
                  <div className="ml-auto w-48 border-t border-border pt-1 text-sm text-fg">{profile.signatoryName}</div>
                  {profile.signatoryDesignation ? (
                    <div className="text-xs text-fg-subtle">{profile.signatoryDesignation}</div>
                  ) : null}
                </div>
              ) : null}

              {profile.letterheadFooter ? (
                <div className="border-t border-border pt-3 text-center text-xs text-fg-subtle">
                  {profile.letterheadFooter}
                </div>
              ) : null}
            </div>
          </Card>
        )}
      </ProfileForm>

      <Alert>
        Your logo and colour come from <strong className="font-medium">Branding</strong>, and your address from{" "}
        <strong className="font-medium">Hospital information</strong> — they are the same details everywhere rather than
        a second copy kept only for printing.
      </Alert>
    </>
  );
}

export default function DocumentSettingsPage() {
  return (
    <RequirePermission perm={PERMISSIONS.ORG_PROFILE_MANAGE}>
      <LetterheadSettings />
    </RequirePermission>
  );
}
