"use client";

import { useEffect, useState } from "react";
import type { DocumentBrand } from "@hms/ui";
import * as api from "../../lib/api";

/**
 * The branding a printed document wears (ADR-047).
 *
 * **Tenant branding when the hospital has configured it, the platform default when
 * it has not.** `GET /branding/current` is RLS-scoped to the caller's own tenant, so
 * a document can only ever be branded as the hospital whose session produced it —
 * there is no path by which one tenant's logo or accent reaches another's paperwork.
 *
 * `ready` gates printing: opening the browser's dialog before the logo has loaded
 * would produce a document missing its own header.
 */
export function useDocumentBrand(): { brand: DocumentBrand; ready: boolean } {
  const [brand, setBrand] = useState<DocumentBrand>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    // Branding and identity are two different records with two different permissions,
    // fetched together because a document header needs both. Each is RLS-scoped to the
    // caller's own tenant.
    Promise.all([api.getCurrentBranding(), api.getOrganizationProfile().catch(() => null)])
      .then(([b, profile]) => {
        if (!alive) return;
        setBrand({
          // The registered name wins where the hospital has one, since this is the
          // party the document is issued by.
          organizationName: profile?.legalName ?? profile?.name ?? b.organization?.name ?? null,
          logoUrl: b.logoUrl,
          accent: b.brandColor,
          // Address, phone, email, website and registration numbers as far as the
          // hospital has configured them (ADR-049). Lines that are not set are simply
          // absent — a wrong address on an invoice is worse than none.
          contactLines: profile?.contactLines ?? [],
          // The letterhead the hospital wrote for itself (ADR-056). Same record, same
          // permission, same tenant scope — there is no second place to configure it,
          // so a document can never print a letterhead that disagrees with the address
          // above it.
          headerLine: profile?.letterheadHeader ?? null,
          footerLine: profile?.letterheadFooter ?? null,
          signatoryName: profile?.signatoryName ?? null,
          signatoryDesignation: profile?.signatoryDesignation ?? null,
          // The uploaded letterhead image and the paper it prints on (ADR-065). Same record,
          // same tenant scope — a document can only ever wear its own hospital's letterhead.
          letterheadImageUrl: profile?.letterheadImageUrl ?? null,
          pageSize: profile?.documentPageSize ?? null,
        });
      })
      .catch(() => {
        // No branding configured, or the call failed: the document falls back to the
        // platform default, which is exactly what `PrintDocument` does with an empty brand.
        if (alive) setBrand({});
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { brand, ready };
}
