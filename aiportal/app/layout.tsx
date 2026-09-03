import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Geist, Geist_Mono } from 'next/font/google';
import '@hms/ui/styles.css';
import './globals.css';
import { Toaster } from '@hms/ui';
import { Providers } from './providers';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

/**
 * The Nirogix AI Portal (ADR-051, ADR-053).
 *
 * On its own registrable domain (`nirogix.ai`), which gives it a separate cookie scope
 * by construction rather than by configuration — the right boundary for a surface with
 * its own access rule.
 *
 * **There is no AI capability behind this portal.** It ships as an authorization
 * boundary so that access is controlled from the day a capability arrives, and the
 * landing screen says so in the product's own words.
 *
 * Never indexed, and nothing identifying may enter this metadata (ADR-027).
 */
export const metadata: Metadata = {
  title: 'Nirogix AI',
  description: 'Nirogix AI Portal',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  referrer: 'strict-origin-when-cross-origin',
};

// Applies the persisted theme before first paint to avoid a flash. No tenant branding:
// this is the platform's own surface and wears the platform's accent.
const noFlashScript = `(function(){try{
  var t=localStorage.getItem('nirogix-ai-theme');
  document.documentElement.setAttribute('data-theme', t==='dark'?'dark':'light');
}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The nonce minted for THIS request by proxy.ts (ADR-082). Next stamps it on the scripts
  // it emits; the one inline script this app owns has to be given it by hand.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

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
          {children}
          {/* The one API-feedback surface for this app (ADR-026). */}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
