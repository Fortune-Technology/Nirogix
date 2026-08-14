import type { MetadataRoute } from "next";
import { CLINIC_MODULES } from "../lib/site";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

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
