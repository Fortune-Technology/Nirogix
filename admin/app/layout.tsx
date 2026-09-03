import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Geist, Geist_Mono } from 'next/font/google';
import '@hms/ui/styles.css';
import './globals.css';
import { BackToTop, Toaster } from '@hms/ui';
import { Providers } from './providers';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

/**
 * Nirogix Platform Administration (ADR-051).
 *
 * The vendor's own operators, on their own origin. This app is deliberately NOT a
 * copy of the staff Portal: it shares the design system through `@hms/ui` and
 * nothing else, so operator code never ships in a hospital's bundle and a change
 * here cannot regress a clinic.
 *
 * Never indexed, and it never renders a tenant's name in metadata (ADR-027).
 */
export const metadata: Metadata = {
  title: 'Nirogix Platform Admin',
  description: 'Nirogix platform administration',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  referrer: 'strict-origin-when-cross-origin',
};

// Applies the persisted theme before first paint to avoid a flash. This app has no
// tenant branding — it is the platform's own surface, so it wears the platform's
// accent and never a customer's.
const noFlashScript = `(function(){try{
  var t=localStorage.getItem('nirogix-admin-theme');
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
          {/* Native scrolling, same as the Portal (ADR-111). Smooth scroll stays on
              the marketing site only. */}
          {children}
          <BackToTop />
          {/* The one API-feedback surface for this app (ADR-026). */}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
