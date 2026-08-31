// Marketing SEO helpers — the one place page metadata and structured data are built.
//
// Rules (resources/rules.md → SEO / AEO / GEO Rules, ADR-027):
//   * Every public route: a UNIQUE title + description, a canonical URL, and its
//     own Open Graph / Twitter pair. No route reuses another's metadata.
//   * Keywords are mapped to matching page intent (see marketing/KNOWLEDGE.md) and
//     read naturally in the copy — never stuffed, never hidden.
//   * Structured data describes only what the page actually shows. No fabricated
//     reviews, ratings, prices, or certifications (PRD Regulatory Register).
//
// The Portal is never indexed — product SEO lives here and nowhere else.

import type { Metadata } from "next";
import { SITE } from "./site";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Staging is a public-DNS copy of the site with no edge access gate (ADR-045), so it
 * must never be indexed. Set `NEXT_PUBLIC_ENVIRONMENT=staging` on that deployment.
 */
export const IS_STAGING = process.env.NEXT_PUBLIC_ENVIRONMENT === "staging";

/**
 * Company facts used by Organization / LocalBusiness structured data, the site
 * footer, and the contact page.
 *
 * WARNING: `streetAddress`, `postalCode`, `telephone`, and `email` are intentionally
 * empty until confirmed. Every surface that renders them is gated on a non-empty
 * value, and LocalBusiness markup is only emitted once a real postal address AND
 * phone number are filled in - schema.org data must be true.
 *
 * These are not cosmetic. DLT (TRAI) sender-ID verification opens the public site
 * and looks for the registered entity name and its contact details; a header is
 * rejected when it cannot find them. Whatever is filled in here must match the
 * incorporation / GST records character-for-character.
 */
export interface CompanyDetails {
  legalName: string;
  city: string;
  region: string;
  country: string;
  countryCode: string;
  streetAddress: string;
  postalCode: string;
  telephone: string;
  email: string;
}

export const COMPANY: CompanyDetails = {
  legalName: SITE.legalName,
  city: "Ahmedabad",
  region: "Gujarat",
  country: "India",
  countryCode: "IN",
  streetAddress: "",
  postalCode: "",
  telephone: "",
  email: "",
};

/**
 * The registered office as display lines, skipping whatever is not confirmed yet,
 * so the address renders truthfully at every stage of being filled in.
 */
export function companyAddressLines(): string[] {
  const locality = [COMPANY.city, COMPANY.region, COMPANY.postalCode].filter(Boolean).join(", ");
  return [COMPANY.streetAddress, locality, COMPANY.country].filter(Boolean);
}

/** `tel:` href for `COMPANY.telephone`, which is written for humans. */
export function telHref(telephone: string): string {
  return `tel:${telephone.replace(/[^+0-9]/g, "")}`;
}

export function canonicalUrl(path: string): string {
  return path === "/" ? SITE_URL : `${SITE_URL}${path}`;
}

export interface PageSeo {
  /** Route path, leading slash (e.g. `/pricing`). */
  path: string;
  /** Unique, intent-matched page title — rendered as `<title> · Nirogix` unless `absoluteTitle`. */
  title: string;
  /** Unique meta description, ~150–160 characters, written for the same intent. */
  description: string;
  /** Set for the home page, whose title should not carry the `· Nirogix` suffix twice. */
  absoluteTitle?: boolean;
}

/**
 * Builds a page's metadata: title, description, canonical, and matching Open
 * Graph + Twitter cards. Every marketing page calls this, so no route can ship
 * with the root layout's metadata by accident.
 */
export function pageMetadata({ path, title, description, absoluteTitle }: PageSeo): Metadata {
  const url = canonicalUrl(path);
  const social = absoluteTitle ? title : `${title} · ${SITE.name}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: SITE.name,
      locale: "en_IN",
      url,
      title: social,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: social,
      description,
    },
  };
}

// ---- Structured data (JSON-LD) ---------------------------------------------
// Only describe what the page renders. Anything unverified stays out.

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: COMPANY.legalName,
    url: SITE_URL,
    brand: SITE.name,
    description: SITE.description,
    areaServed: COMPANY.countryCode,
    address: {
      "@type": "PostalAddress",
      addressLocality: COMPANY.city,
      addressRegion: COMPANY.region,
      addressCountry: COMPANY.countryCode,
    },
  };
}

/**
 * The product itself. `offers` is deliberately absent — pricing is quote-based and
 * no numbers are published (content guardrail), so claiming a price would be false.
 */
export function softwareApplicationJsonLd(opts?: { name?: string; description?: string; path?: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: opts?.name ?? `${SITE.name} Hospital Management System`,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Hospital Management Software",
    operatingSystem: "Web browser",
    url: canonicalUrl(opts?.path ?? "/"),
    description: opts?.description ?? SITE.description,
    areaServed: COMPANY.countryCode,
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

/** Emitted only when the address and phone are real — see COMPANY above. */
export function localBusinessJsonLd() {
  if (!COMPANY.streetAddress || !COMPANY.telephone) return null;
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${SITE_URL}/#localbusiness`,
    name: COMPANY.legalName,
    url: SITE_URL,
    telephone: COMPANY.telephone,
    email: COMPANY.email || undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: COMPANY.streetAddress,
      addressLocality: COMPANY.city,
      addressRegion: COMPANY.region,
      postalCode: COMPANY.postalCode,
      addressCountry: COMPANY.countryCode,
    },
    areaServed: COMPANY.countryCode,
  };
}

export function breadcrumbJsonLd(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: canonicalUrl(item.path),
    })),
  };
}

/** Only for FAQs that are genuinely rendered on the page. */
export function faqJsonLd(entries: readonly { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((e) => ({
      "@type": "Question",
      name: e.q,
      acceptedAnswer: { "@type": "Answer", text: e.a },
    })),
  };
}
