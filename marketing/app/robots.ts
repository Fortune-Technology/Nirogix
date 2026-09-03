import type { MetadataRoute } from 'next';
import { SITE_URL, IS_STAGING } from '../lib/seo';

/**
 * Production allows crawling; **staging refuses it entirely** (ADR-045).
 *
 * Staging runs on public DNS with no edge access gate, so if it were crawlable the
 * same marketing copy would exist on two hostnames and compete with the real site.
 * Nginx also sends `X-Robots-Tag: noindex` on those hosts — this is the second lock,
 * because a misconfigured server block should not be the only thing standing between
 * unreleased work and a search index.
 */
export default function robots(): MetadataRoute.Robots {
  if (IS_STAGING) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
