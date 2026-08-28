import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@hms/ui/styles.css";
import "./globals.css";
import { BackToTop, LottiePreloader, SmoothScroll } from "@hms/ui";
import { ThemeProvider } from "../lib/theme";
import { getMarketingBrandingStyle } from "../lib/branding";
import { SiteHeader } from "../components/site/SiteHeader";
import { SiteFooter } from "../components/site/SiteFooter";
import { MarketingMobileNav } from "../components/site/MobileNav";
import { SITE } from "../lib/site";
import { JsonLd } from "../components/site/JsonLd";
import { SITE_URL, organizationJsonLd } from "../lib/seo";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Defaults only. Every route sets its own unique title/description/canonical via
// `pageMetadata()` (lib/seo.ts) — these apply to anything that somehow does not.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE.name}: modular hospital management system for India`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    "hospital management system",
    "HMS",
    "clinic software India",
    "EMR",
    "multi-tenant HMS",
    "pharmacy management",
    "laboratory information system",
    "hospital billing",
    "ABDM",
  ],
  authors: [{ name: SITE.legalName }],
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: `${SITE.name}: modular hospital management system for India`,
    description: SITE.description,
    locale: "en_IN",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name}: modular hospital management system for India`,
    description: SITE.description,
  },
  robots: { index: true, follow: true },
};

// Paints the persisted theme before first paint, no flash. Light for everyone unless
// the visitor explicitly chose Dark before — the OS preference is never consulted
// (ADR-079; same script shape as the other four apps).
const noFlashScript = `(function(){try{
  var t=localStorage.getItem('mk-theme');
  document.documentElement.setAttribute('data-theme', t==='dark'?'dark':'light');
}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Platform branding (ADR-024) — inline --mk-* overrides applied on <html> (both themes).
  const brandStyle = await getMarketingBrandingStyle();
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      style={brandStyle}
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
        {/* Site-wide publisher identity; pages reference it by @id. */}
        <JsonLd data={organizationJsonLd()} />
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <LottiePreloader src="/animations/ambulance.json" tintCssVar="--mk-accent" />
          <SmoothScroll>
            <SiteHeader />
            <main className="hms-bottomnav-offset flex-1">{children}</main>
            <SiteFooter />
            <BackToTop />
            <MarketingMobileNav />
          </SmoothScroll>
        </ThemeProvider>
      </body>
    </html>
  );
}
