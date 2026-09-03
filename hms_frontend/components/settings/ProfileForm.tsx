'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Alert, Button, Card, Field, Skeleton, Textarea } from '@hms/ui';
import type { OrganizationProfile, UpdateOrganizationProfileRequest } from '@hms/types';
import * as api from '../../lib/api';

/**
 * Hospital identity is **one record** edited from more than one screen (ADR-056).
 *
 * The registered address, the public contact details and the letterhead all live in the
 * same `organization_profile` row, so there is no second identity store to drift out of
 * sync — a hospital that corrects its phone number corrects it everywhere at once. Each
 * screen declares the subset of fields it owns and sends only those, which is why the
 * backend's partial update treats an omitted field as "leave it alone".
 */

export type ProfileField = {
  key: keyof UpdateOrganizationProfileRequest;
  label: string;
  hint?: string;
  wide?: boolean;
  multiline?: boolean;
};

type FormState = Record<string, string>;

function toForm(p: OrganizationProfile, fields: ProfileField[]): FormState {
  const state: FormState = {};
  for (const f of fields)
    state[f.key as string] = (p[f.key as keyof OrganizationProfile] as string | null) ?? '';
  return state;
}

export function ProfileForm({
  fields,
  header,
  intro,
  children,
}: {
  fields: ProfileField[];
  header: string;
  intro?: ReactNode;
  /** Rendered below the form with the saved profile — usually a preview of how it prints. */
  children?: (profile: OrganizationProfile) => ReactNode;
}) {
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getOrganizationProfile()
      .then((p) => {
        setProfile(p);
        setForm(toForm(p, fields));
      })
      .catch((e) =>
        setLoadError(
          e instanceof api.ApiRequestError ? e.message : "Could not load your hospital's details.",
        ),
      );
    // `fields` is a module-level constant at every call site; re-running on identity would
    // refetch on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Only this screen's fields are sent, so saving the letterhead can never blank an
      // address the administrator was not even looking at.
      const updated = await api.updateOrganizationProfile(form as UpdateOrganizationProfileRequest);
      setProfile(updated);
      setForm(toForm(updated, fields));
    } catch {
      /* reported by the shared API-feedback layer (ADR-026) */
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <Alert tone="danger">{loadError}</Alert>;
  if (!profile) return <Skeleton height="20rem" />;

  const saved = profile;
  const dirty = fields.some(
    (f) =>
      form[f.key as string] !==
      ((saved[f.key as keyof OrganizationProfile] as string | null) ?? ''),
  );

  return (
    <>
      <Card header={header}>
        {intro ? <p className="mb-4 text-sm text-fg-muted">{intro}</p> : null}
        <form onSubmit={save}>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => {
              const props = {
                label: f.label,
                value: form[f.key as string] ?? '',
                hint: f.hint,
                onChange: (e: { target: { value: string } }) =>
                  setForm((s) => ({ ...s, [f.key as string]: e.target.value })),
              };
              return (
                <div key={f.key as string} className={f.wide ? 'sm:col-span-2' : undefined}>
                  {f.multiline ? <Textarea {...props} rows={3} /> : <Field {...props} />}
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button type="submit" loading={saving} disabled={!dirty}>
              Save
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setForm(toForm(saved, fields))}
              disabled={!dirty}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Card>

      {children?.(profile)}
    </>
  );
}
