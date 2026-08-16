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
    api
      .getCurrentBranding()
      .then((b) => {
        if (!alive) return;
        setBrand({
          organizationName: b.organization?.name ?? null,
          logoUrl: b.logoUrl,
          accent: b.brandColor,
          // Address, phone, email, website and registration numbers are not in the
          // schema yet (BACKLOG U-8). The header renders what exists rather than
          // inventing a placeholder — a wrong address on an invoice is worse than none.
          contactLines: [],
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
