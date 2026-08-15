import type { MetadataRoute } from "next";
import { CLINIC_MODULES } from "../lib/site";
import { SITE_URL } from "../lib/seo";

/**
 * Every public route, and nothing else (ADR-027). A new marketing route adds its
 * entry here in the same change; a removed one is 301'd, never left dead.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const staticPaths = [
    "",
    "/platform",
    "/modules",
    "/solutions",
    "/security",
    "/integrations",
    "/pricing",
    "/about",
    "/contact",
    "/legal/privacy",
    "/legal/terms",
  ];

  const modulePaths = CLINIC_MODULES.map((m) => `/modules/${m.slug}`);

  return [...staticPaths, ...modulePaths].map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
