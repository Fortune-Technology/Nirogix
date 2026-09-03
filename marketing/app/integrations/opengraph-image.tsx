import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from '../../lib/og';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Speaks the standards you already use';

export default function Image() {
  return ogImage({ title: 'Speaks the standards you already use', eyebrow: 'Integrations' });
}
