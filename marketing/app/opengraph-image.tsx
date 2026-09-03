import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from '../lib/og';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Hospital management, module by module';

export default function Image() {
  return ogImage({ title: 'Hospital management, module by module' });
}
