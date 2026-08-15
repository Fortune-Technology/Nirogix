import { CLINIC_MODULES } from "../../../lib/site";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "../../../lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "HMS module";

const bySlug = Object.fromEntries(CLINIC_MODULES.map((m) => [m.slug, m]));

/** One card per module, generated at build time alongside the page itself. */
export function generateStaticParams() {
  return CLINIC_MODULES.map((m) => ({ slug: m.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const mod = bySlug[slug];
  return ogImage({ title: mod?.name ?? "Modules", eyebrow: "Module" });
}
