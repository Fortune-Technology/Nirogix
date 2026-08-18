/**
 * Renders a structured-data block (ADR-027). Server component — the JSON is
 * serialized at build time, so no client JavaScript ships for it.
 *
 * Only pass schema describing what the page actually renders; `null` renders
 * nothing, which is how the optional LocalBusiness block stays out until the
 * company's postal address and phone are confirmed.
 */
export function JsonLd({ data }: { data: unknown }) {
  if (!data) return null;
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
