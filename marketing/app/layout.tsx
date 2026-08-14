import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@hms/ui/styles.css";
import "./globals.css";
import { BackToTop, LottiePreloader, SmoothScroll } from "@hms/ui";
import { ThemeProvider } from "../lib/theme";
import { getMarketingBrandingStyle } from "../lib/branding";
import { SiteHeader } from "../components/site/SiteHeader";
import { SiteFooter } from "../components/site/SiteFooter";
import { SITE } from "../lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE.name} — Modular hospital management system for India`,
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
    title: `${SITE.name} — Modular hospital management system for India`,
    description: SITE.description,
    locale: "en_IN",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} — Modular hospital management system for India`,
    description: SITE.description,
  },
  robots: { index: true, follow: true },
};

const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE.legalName,
  url: SITE_URL,
  brand: SITE.name,
  description: SITE.description,
  areaServed: "IN",
};

// Paints the persisted (or system-preferred) theme before first paint, no flash.
const noFlashScript = `(function(){try{
  var t=localStorage.getItem('mk-theme');
  if(t!=='dark'&&t!=='light'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}
  document.documentElement.setAttribute('data-theme',t);
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
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <LottiePreloader src="/animations/ambulance.json" tintCssVar="--mk-accent" />
          <SmoothScroll>
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
            <BackToTop />
          </SmoothScroll>
        </ThemeProvider>
      </body>
    </html>
  );
}
