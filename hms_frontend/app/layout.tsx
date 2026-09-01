import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "@hms/ui/styles.css";
import "./globals.css";
import { BackToTop, LottiePreloader, Toaster } from "@hms/ui";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The Portal is a private, multi-tenant clinical application: it is never indexed
// and never advertises anything about a tenant (ADR-027). Product SEO lives on the
// marketing site. No patient/tenant/staff data may enter this metadata.
export const metadata: Metadata = {
  title: "Nirogix Portal",
  description: "Nirogix staff portal",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  referrer: "strict-origin-when-cross-origin",
};

// Applies the persisted theme + tenant brand before first paint to avoid a flash.
// Defaults to Light (the product default) when nothing is stored.
const noFlashScript = `(function(){try{
  var t=localStorage.getItem('hms-theme');
  document.documentElement.setAttribute('data-theme', t==='dark'?'dark':'light');
  var b=localStorage.getItem('hms-brand');
  if(b){document.documentElement.style.setProperty('--hms-brand',b);}
}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The nonce minted for THIS request by proxy.ts (ADR-082). Next stamps it on the scripts
  // it emits; the one inline script this app owns has to be given it by hand.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className="min-h-full">
        <Providers>
          <LottiePreloader src="/animations/ambulance.json" tintCssVar="--hms-brand" />
          {/* Native scrolling (ADR-111). Lenis is the marketing site's alone: on a
              working screen a hijacked scroll fights the browser over long tables,
              tall forms and anything with its own overflow, and the failures it
              causes are the kind where a page simply will not scroll. */}
          {children}
          <BackToTop />
          {/* The one API-feedback surface for the Portal (ADR-026). */}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
