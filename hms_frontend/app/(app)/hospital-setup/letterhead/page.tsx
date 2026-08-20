"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, Button, Card, Field, Skeleton, Textarea } from "@hms/ui";
import type { DocumentPageSize, OrganizationProfile } from "@hms/types";
import { PERMISSIONS } from "@hms/permissions";
import { RequirePermission } from "../../../../components/Can";
import * as api from "../../../../lib/api";

/**
 * Letterhead & documents (ADR-056, ADR-065).
 *
 * Three things a hospital sets for everything it prints, all on the one `organization_profile`
 * record so nothing drifts:
 *   1. a pre-designed **letterhead image** — the header the hospital already prints on paper,
 *      uploaded once and worn by every invoice, receipt, prescription and report;
 *   2. the **page size** those documents target (A4 by default, A5 / US Letter / US Legal);
 *   3. the **text letterhead** — the tagline, the footer strip and who signs — used when
 *      there is no image, and printed around it when there is.
 *
 * The logo, colour and address still come from Branding and Hospital information — this screen
 * never keeps a second copy of them.
 */

const PAGE_SIZES: { value: DocumentPageSize; label: string; dimensions: string; ratio: string }[] = [
  { value: "A4", label: "A4", dimensions: "210 × 297 mm", ratio: "210 / 297" },
  { value: "A5", label: "A5", dimensions: "148 × 210 mm", ratio: "148 / 210" },
  { value: "LETTER", label: "US Letter", dimensions: "8.5 × 11 in", ratio: "216 / 279" },
  { value: "LEGAL", label: "US Legal", dimensions: "8.5 × 14 in", ratio: "216 / 356" },
];

type TextState = {
  letterheadHeader: string;
  letterheadFooter: string;
  signatoryName: string;
  signatoryDesignation: string;
};

const EMPTY_TEXT: TextState = {
  letterheadHeader: "",
  letterheadFooter: "",
  signatoryName: "",
  signatoryDesignation: "",
};

function toText(p: OrganizationProfile): TextState {
  return {
    letterheadHeader: p.letterheadHeader ?? "",
    letterheadFooter: p.letterheadFooter ?? "",
    signatoryName: p.signatoryName ?? "",
    signatoryDesignation: p.signatoryDesignation ?? "",
  };
}

function LetterheadSettings() {
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);
  const [text, setText] = useState<TextState>(EMPTY_TEXT);
  const [pageSize, setPageSize] = useState<DocumentPageSize>("A4");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  function apply(p: OrganizationProfile) {
    setProfile(p);
    setText(toText(p));
    setPageSize(p.documentPageSize ?? "A4");
  }

  useEffect(() => {
    api
      .getOrganizationProfile()
      .then(apply)
      .catch((e) =>
        setLoadError(e instanceof api.ApiRequestError ? e.message : "Could not load your hospital's details."),
      );
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Only this screen's fields are sent (ADR-056): saving the letterhead can never blank
      // an address the administrator was not even looking at.
      apply(await api.updateOrganizationProfile({ ...text, documentPageSize: pageSize }));
    } catch {
      /* reported by the shared API-feedback layer (ADR-026) */
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      apply(await api.uploadLetterheadImage(file));
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setUploading(false);
      if (imageInput.current) imageInput.current.value = "";
    }
  }

  async function removeImage() {
    setRemoving(true);
    try {
      apply(await api.removeLetterheadImage());
    } catch {
      /* reported by the shared API-feedback layer */
    } finally {
      setRemoving(false);
    }
  }

  if (loadError) return <Alert tone="danger">{loadError}</Alert>;
  if (!profile) return <Skeleton height="24rem" />;

  const imageUrl = profile.letterheadImageUrl;
  const activeRatio = PAGE_SIZES.find((s) => s.value === pageSize)?.ratio ?? "210 / 297";
  const dirty =
    pageSize !== (profile.documentPageSize ?? "A4") ||
    (Object.keys(text) as (keyof TextState)[]).some((k) => text[k] !== toText(profile)[k]);

  return (
    <div className="grid gap-6">
      {/* 1 — Letterhead image ------------------------------------------------- */}
      <Card header="Letterhead image">
        <p className="mb-4 text-sm text-fg-muted">
          Upload the header your hospital already prints on paper. When set, it prints full-width across the top of every
          document — invoices, receipts, prescriptions and reports — and replaces the plain name-and-address header
          below. Leave it empty to use that text header instead.
        </p>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="rounded-token border border-border bg-surface-2 p-3">
            {imageUrl ? (
              // A signed, cross-origin asset URL of unknown dimensions; next/image would need
              // width/height and a remote-domain allowlist for a simple settings preview.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt="Current letterhead"
                className="mx-auto max-h-40 w-full object-contain"
              />
            ) : (
              <div className="flex h-32 items-center justify-center text-sm text-fg-subtle">
                No letterhead image set
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:w-44">
            <input
              ref={imageInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => uploadImage(e.target.files?.[0])}
            />
            <Button variant="secondary" onClick={() => imageInput.current?.click()} loading={uploading}>
              {imageUrl ? "Replace image" : "Upload image"}
            </Button>
            {imageUrl ? (
              <Button variant="ghost" onClick={removeImage} loading={removing}>
                Remove image
              </Button>
            ) : null}
            <p className="text-xs text-fg-subtle">
              A wide image sized for the top of the page (PNG or JPG). Keep important marks away from the very edges;
              printers cannot print the outer few millimetres.
            </p>
          </div>
        </div>
      </Card>

      {/* 2 + 3 — Page size and text letterhead, saved together ---------------- */}
      <Card header="Page size & letterhead text">
        <form onSubmit={save}>
          <span className="hms-label">Page size</span>
          <p className="mb-2 text-sm text-fg-muted">The paper every printed document targets.</p>
          <div
            role="radiogroup"
            aria-label="Document page size"
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {PAGE_SIZES.map((s) => {
              const active = s.value === pageSize;
              return (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setPageSize(s.value)}
                  className={[
                    "rounded-token border px-3 py-2 text-left transition-colors",
                    active
                      ? "border-brand bg-brand-subtle text-brand"
                      : "border-border text-fg-muted hover:border-brand/60 hover:text-fg",
                  ].join(" ")}
                >
                  <span className="block text-sm font-medium">{s.label}</span>
                  <span className="block text-xs text-fg-subtle">{s.dimensions}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field
                label="Header line"
                hint="Printed under your hospital's name: a tagline, accreditation, or the department. Used only when there is no letterhead image."
                value={text.letterheadHeader}
                onChange={(e) => setText((t) => ({ ...t, letterheadHeader: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Textarea
                label="Footer text"
                hint="Printed along the bottom of every page: hours, a disclaimer, or where to call."
                rows={3}
                value={text.letterheadFooter}
                onChange={(e) => setText((t) => ({ ...t, letterheadFooter: e.target.value }))}
              />
            </div>
            <Field
              label="Default signatory"
              hint="Whose name prints on the signature line."
              value={text.signatoryName}
              onChange={(e) => setText((t) => ({ ...t, signatoryName: e.target.value }))}
            />
            <Field
              label="Signatory designation"
              hint="For example, Medical Superintendent."
              value={text.signatoryDesignation}
              onChange={(e) => setText((t) => ({ ...t, signatoryDesignation: e.target.value }))}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button type="submit" loading={saving} disabled={!dirty}>
              Save
            </Button>
            <Button type="button" variant="secondary" onClick={() => apply(profile)} disabled={!dirty}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>

      {/* Preview — image (or text header) on the chosen page ------------------ */}
      <Card header="Preview">
        <p className="mb-4 text-sm text-fg-muted">
          How the letterhead sits on a {PAGE_SIZES.find((s) => s.value === pageSize)?.label} page. The real document
          carries your branding colour and is rendered by the shared print kit; this shows the layout and copy.
        </p>
        {/* A paper replica: always white with dark ink whatever the app theme, exactly like the
            printed document (a document is a document in Dark mode too). The ink/rule literals
            mirror the print kit's own `--doc-*` values; the accent rule uses `border-brand` so it
            follows the tenant's real accent rather than a frozen teal. */}
        <div
          className="mx-auto max-w-sm overflow-hidden rounded-token border border-border bg-white text-[#111827] shadow-sm"
          style={{ aspectRatio: activeRatio }}
        >
          <div className="flex h-full flex-col p-4">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- see above.
              <img src={imageUrl} alt="" className="max-h-24 w-full border-b-2 border-brand object-contain pb-2" />
            ) : (
              <div className="border-b-2 border-brand pb-2">
                <div className="text-sm font-semibold">{profile.displayName || profile.name}</div>
                {text.letterheadHeader ? (
                  <div className="text-[11px] italic text-[#4b5563]">{text.letterheadHeader}</div>
                ) : null}
                {profile.contactLines.map((line) => (
                  <div key={line} className="text-[10px] text-[#4b5563]">
                    {line}
                  </div>
                ))}
              </div>
            )}

            <div className="flex-1 py-6 text-center text-[11px] text-[#9ca3af]">Document content</div>

            {text.signatoryName ? (
              <div className="mb-2 text-right">
                <div className="ml-auto w-28 border-t border-[#d1d5db] pt-1 text-[11px]">{text.signatoryName}</div>
                {text.signatoryDesignation ? (
                  <div className="text-[10px] text-[#4b5563]">{text.signatoryDesignation}</div>
                ) : null}
              </div>
            ) : null}

            {text.letterheadFooter ? (
              <div className="border-t border-[#d1d5db] pt-2 text-center text-[10px] text-[#4b5563]">
                {text.letterheadFooter}
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <Alert>
        Your logo and colour come from <strong className="font-medium">Branding</strong>, and your address from{" "}
        <strong className="font-medium">Hospital information</strong>. They are the same details everywhere rather than
        a second copy kept only for printing.
      </Alert>
    </div>
  );
}

export default function DocumentSettingsPage() {
  return (
    <RequirePermission perm={PERMISSIONS.ORG_PROFILE_MANAGE}>
      <LetterheadSettings />
    </RequirePermission>
  );
}
