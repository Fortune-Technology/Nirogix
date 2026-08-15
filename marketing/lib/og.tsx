// Open Graph card renderer for the marketing site (rules.md → SEO / AEO / GEO).
//
// Each route segment exports a 3-line `opengraph-image.tsx` that calls `ogImage()`,
// so every page ships a social card matching its own title instead of falling back
// to a single generic image.
//
// NOTE ON COLOURS: `ImageResponse` renders through Satori, which has no CSS custom
// properties — the design tokens cannot be referenced here. These four hexes are
// the ONLY hardcoded colours in the app and mirror resources/DESIGN.md §2
// (surface-ink, accent, ink-inverse, ink-subtle). Update them together with the
// design system, never independently.

import { ImageResponse } from "next/og";
import { SITE } from "./site";

const INK = "#0e1f26"; // DESIGN.md — surface ink
const ACCENT = "#0e7490"; // DESIGN.md — deep-teal accent
const ON_INK = "#ffffff"; // DESIGN.md — ink inverse
const MUTED = "#9aa8ac"; // DESIGN.md — ink faint

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/**
 * Renders the card: eyebrow (section), the page's own headline, and the wordmark.
 * Keep `title` short — this is the social headline, not the meta description.
 */
export function ogImage({ title, eyebrow }: { title: string; eyebrow?: string }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: INK,
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: ACCENT }} />
          <div style={{ display: "flex", fontSize: 30, fontWeight: 600, color: ON_INK }}>{SITE.name}</div>
          {eyebrow ? (
            <div style={{ display: "flex", fontSize: 22, color: MUTED, letterSpacing: 1 }}>
              {`· ${eyebrow.toUpperCase()}`}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            fontSize: title.length > 46 ? 62 : 74,
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: -2,
            color: ON_INK,
            maxWidth: 980,
          }}
        >
          {title}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 96, height: 5, borderRadius: 999, background: ACCENT }} />
          <div style={{ display: "flex", fontSize: 26, color: MUTED }}>
            Multi-tenant hospital management, built for India
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
