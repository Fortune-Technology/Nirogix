import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from '../../lib/og';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Built for Indian hospitals';

export default function Image() {
  return ogImage({ title: 'Built for Indian hospitals', eyebrow: 'About' });
}
