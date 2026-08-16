"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert, Badge, Button, Card, Field, Skeleton } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import type { OrganizationProfile, UpdateOrganizationProfileRequest } from "@hms/types";
import * as api from "../../../../lib/api";
import { RequirePermission } from "../../../../components/Can";

/**
 * The hospital's own identity (ADR-049, closing BACKLOG U-8).
 *
 * These fields are what a tax invoice header legally needs from the supplier. Every
 * one is optional and nothing is invented: a document prints the lines that exist
 * and omits the rest, because a wrong address on an invoice is worse than none.
 *
 * Success and failure are announced by the shared toast raised inside the API client
 * (ADR-026) — this screen keeps no notification state of its own.
 */

type FormState = Record<string, string>;

const FIELDS: { key: keyof UpdateOrganizationProfileRequest; label: string; hint?: string; wide?: boolean }[] = [
  { key: "legalName", label: "Registered / legal name", hint: "Only if it differs from the name above.", wide: true },
  { key: "addressLine1", label: "Address line 1", wide: true },
  { key: "addressLine2", label: "Address line 2", wide: true },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "postalCode", label: "PIN code", hint: "6 digits." },
  { key: "country", label: "Country" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "website", label: "Website", hint: "Include https://" },
  { key: "registrationNumber", label: "Registration number", hint: "Clinical establishment / hospital registration." },
  { key: "gstin", label: "GSTIN", hint: "15 characters." },
];

function toForm(p: OrganizationProfile): FormState {
  const state: FormState = {};
  for (const f of FIELDS) state[f.key as string] = (p[f.key as keyof OrganizationProfile] as string | null) ?? "";
  return state;
}

function OrganizationForm() {
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getOrganizationProfile()
      .then((p) => {
        setProfile(p);
        setForm(toForm(p));
      })
      .catch((e) => setLoadError(e instanceof api.ApiRequestError ? e.message : "Could not load your hospital's details."));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.updateOrganizationProfile(form as UpdateOrganizationProfileRequest);
      setProfile(updated);
      setForm(toForm(updated));
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <Alert tone="danger">{loadError}</Alert>;
  if (!profile) return <Skeleton height="20rem" />;

  const dirty = FIELDS.some((f) => form[f.key as string] !== ((profile[f.key as keyof OrganizationProfile] as string | null) ?? ""));

  return (
    <>
      <Card header="Hospital">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-lg font-semibold text-fg">{profile.name}</span>
          <Badge>{profile.code}</Badge>
          {profile.isComplete ? (
            <Badge tone="success">Ready for documents</Badge>
          ) : (
            <Badge tone="warning">Incomplete</Badge>
          )}
        </div>
        <p className="mt-2 text-sm text-fg-muted">
          Your hospital&apos;s name and code were set when Nirogix created your account — talk to us to change them.
          Everything below is yours to maintain, and appears in the header of every invoice and report you print.
        </p>
      </Card>

      <Card header="Registered details">
        <form onSubmit={save}>
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key as string} className={f.wide ? "sm:col-span-2" : undefined}>
                <Field
                  label={f.label}
                  value={form[f.key as string] ?? ""}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key as string]: e.target.value }))}
                  hint={f.hint}
                />
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button type="submit" loading={saving} disabled={!dirty}>
              Save details
            </Button>
            <Button type="button" variant="secondary" onClick={() => setForm(toForm(profile))} disabled={!dirty}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>

      <Card header="How this prints">
        {profile.contactLines.length === 0 ? (
          <p className="text-sm text-fg-muted">
            Nothing is configured yet, so your documents print your hospital&apos;s name and logo and no address block.
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
    </>
  );
}

export default function OrganizationSettingsPage() {
  return (
    <RequirePermission perm={PERMISSIONS.ORG_PROFILE_MANAGE}>
      <OrganizationForm />
    </RequirePermission>
  );
}
