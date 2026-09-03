import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from '../../lib/og';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'One platform. Modules you turn on.';

export default function Image() {
  return ogImage({ title: 'One platform. Modules you turn on.', eyebrow: 'Platform' });
}
