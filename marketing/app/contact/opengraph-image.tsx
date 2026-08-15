import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "../../lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Book a walkthrough";

export default function Image() {
  return ogImage({ title: "Book a walkthrough", eyebrow: "Contact" });
}
