import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from '../../lib/og';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Pay for the modules you turn on';

export default function Image() {
  return ogImage({ title: 'Pay for the modules you turn on', eyebrow: 'Pricing' });
}
