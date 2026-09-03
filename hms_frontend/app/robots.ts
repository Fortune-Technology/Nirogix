import type { MetadataRoute } from 'next';

/**
 * The Portal is a private clinical application — nothing here is ever crawled or
 * indexed (ADR-027, resources/rules.md → SEO / AEO / GEO Rules). This is the
 * belt to the root layout's `robots: { index: false, follow: false }` braces:
 * the meta tag covers rendered pages, this covers the origin. All product SEO
 * lives on the marketing site, which publishes its own robots + sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
