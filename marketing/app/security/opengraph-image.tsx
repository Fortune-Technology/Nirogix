import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from '../../lib/og';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Isolation, residency, and an audit trail';

export default function Image() {
  return ogImage({ title: 'Isolation, residency, and an audit trail', eyebrow: 'Security' });
}
