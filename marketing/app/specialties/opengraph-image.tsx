import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "../../lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Configured for how your specialty works";

export default function Image() {
  return ogImage({ title: "Configured for how your specialty works", eyebrow: "Specialties" });
}
