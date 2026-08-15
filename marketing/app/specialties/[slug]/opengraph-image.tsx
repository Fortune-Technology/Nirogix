import { FEATURED_SPECIALTIES, specialtyBySlug } from "../../../lib/specialties";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "../../../lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "HMS by specialty";

export function generateStaticParams() {
  return FEATURED_SPECIALTIES.map((s) => ({ slug: s.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return ogImage({ title: `Built for ${specialtyBySlug(slug)?.name ?? "your specialty"}`, eyebrow: "Specialty" });
}
