"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PrintDocument, PrintNote, PrintSection, PrintToolbar, Spinner } from "@hms/ui";
import * as api from "../../lib/api";
import { useDocumentBrand } from "./useDocumentBrand";
import type { PublicAccessSettings } from "../settings/PublicAccessPanel";

/**
 * One poster document for every token-fronted public surface (ADR-047, ADR-056,
 * ADR-069). The registration and booking posters were copies; the document mechanics —
 * settings read under the same permission as the settings screen (the token is never
 * in the URL), brand, loading/disabled states, QR layout — live here, and a route
 * supplies only its words.
 */

type Brand = ReturnType<typeof useDocumentBrand>["brand"];

export interface PublicQrPosterProps {
  /** Document title, e.g. "Patient registration". */
  title: string;
  /** Big line on the poster. */
  lead: string;
  /** Line under it. */
  sub: string;
  /** The "What happens next" note body. */
  whatNext: string;
  /** Message when the surface is switched off (no poster to print). */
  disabledMessage: string;
  /** Where the toolbar's back button returns to. */
  backHref: string;
  load: () => Promise<PublicAccessSettings>;
  useQr: (token: string | null, brand: Brand) => { url: string | null; qr: string | null };
}

export function PublicQrPoster(props: PublicQrPosterProps) {
  const router = useRouter();
  const { brand, ready } = useDocumentBrand();
  const [settings, setSettings] = useState<PublicAccessSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    props
      .load()
      .then(setSettings)
      .catch((e) => setError(e instanceof api.ApiRequestError ? e.message : "Could not load these settings."));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- props.load is a module-level fn
  }, [props.load]);

  const { url, qr } = props.useQr(settings?.token ?? null, brand);

  if (error) return <p className="mx-auto max-w-2xl text-center text-sm text-danger">{error}</p>;

  if (settings && !settings.enabled) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-sm text-fg-muted">{props.disabledMessage}</p>
      </div>
    );
  }

  if (!settings || !ready || !qr || !url) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-fg-muted">
        <Spinner /> Preparing the poster…
      </div>
    );
  }

  return (
    <>
      <PrintToolbar onBack={() => router.push(props.backHref)} backLabel="Back to settings" />

      <PrintDocument
        brand={brand}
        title={props.title}
        computerGenerated={false}
        footerNote="Display at reception, the entrance or the waiting area."
      >
        <PrintSection>
          <div className="hms-qr-poster">
            <p className="hms-qr-poster__lead">{props.lead}</p>
            <p className="hms-qr-poster__sub">{props.sub}</p>

            {/* eslint-disable-next-line @next/next/no-img-element -- a generated data: URI,
                and the print dialog must not open before it has loaded */}
            <img src={qr} alt="" className="hms-qr-poster__code" />

            <p className="hms-qr-poster__url">{url}</p>
          </div>
        </PrintSection>

        <PrintNote title="What happens next">{props.whatNext}</PrintNote>
      </PrintDocument>
    </>
  );
}
