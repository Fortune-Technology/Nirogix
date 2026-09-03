import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from '../../lib/og';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Built around how your team works';

export default function Image() {
  return ogImage({ title: 'Built around how your team works', eyebrow: 'Solutions' });
}
