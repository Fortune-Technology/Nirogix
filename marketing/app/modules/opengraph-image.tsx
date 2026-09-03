import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from '../../lib/og';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Every module, sold on its own';

export default function Image() {
  return ogImage({ title: 'Every module, sold on its own', eyebrow: 'Modules' });
}
